/**
 * Cobertura de los periodos de una serie de tiempo.
 *
 * Un reporte agrupado por semana o por mes casi siempre corta el primero y el
 * último bucket: un rango que arranca el 1 de julio cae a media semana, y uno
 * que termina hoy deja el mes en curso con unos cuantos días. Graficar esos
 * periodos junto a los completos hace parecer que la venta se desplomó, cuando
 * lo único que pasa es que al periodo le faltan días.
 *
 * Aquí se calcula cuánto de cada periodo entró de verdad en la consulta, para
 * que quien pinte la serie pueda marcarlo.
 */

export type GroupBy = 'dia' | 'semana' | 'mes';

const MS_POR_DIA = 86_400_000;

/**
 * Fecha calendario (YYYY-MM-DD) de lo que devuelve MySQL. Una columna DATE llega
 * como Date y hay que leerla por sus componentes LOCALES: con toISOString() la
 * fecha se recorre un día en husos con desfase positivo. DATE_FORMAT ya llega
 * como texto.
 */
export function aFechaCalendario(valor: unknown): string {
    if (valor instanceof Date) {
        const mes = String(valor.getMonth() + 1).padStart(2, '0');
        const dia = String(valor.getDate()).padStart(2, '0');
        return `${valor.getFullYear()}-${mes}-${dia}`;
    }
    return String(valor).slice(0, 10);
}

/** YYYY-MM-DD a milisegundos UTC, para restar días sin que estorbe el horario de verano. */
function aUtc(fecha: string): number {
    return Date.UTC(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, Number(fecha.slice(8, 10)));
}

/** Último día que cubre el periodo que empieza en `inicio`, según la agrupación. */
export function finDelPeriodo(inicio: string, groupBy: GroupBy): string {
    if (groupBy === 'dia') return inicio;
    if (groupBy === 'semana') return new Date(aUtc(inicio) + 6 * MS_POR_DIA).toISOString().slice(0, 10);
    // El día 0 del mes siguiente es el último del actual.
    const año = Number(inicio.slice(0, 4));
    const mes = Number(inicio.slice(5, 7));
    return new Date(Date.UTC(año, mes, 0)).toISOString().slice(0, 10);
}

export interface Cobertura {
    /** Días del periodo que sí entraron en la consulta. */
    DiasCubiertos: number;
    /** Días que tiene el periodo completo (28-31 para un mes, 7 para una semana). */
    DiasPeriodo: number;
    /** El rango corta este periodo, así que su total no es comparable con los demás. */
    Parcial: boolean;
}

/**
 * Cuánto del periodo alcanzó a entrar en el rango consultado.
 *
 * `hasta` debe venir ya topado con hoy: un rango que termina en el futuro
 * tampoco tiene datos de los días que faltan, y el periodo sigue incompleto.
 */
export function coberturaDelPeriodo(
    inicioPeriodo: string,
    groupBy: GroupBy,
    desde: string,
    hasta: string
): Cobertura {
    const finPeriodo = finDelPeriodo(inicioPeriodo, groupBy);
    const diasPeriodo = Math.round((aUtc(finPeriodo) - aUtc(inicioPeriodo)) / MS_POR_DIA) + 1;

    const desdeEfectivo = Math.max(aUtc(inicioPeriodo), aUtc(desde));
    const hastaEfectivo = Math.min(aUtc(finPeriodo), aUtc(hasta));
    const cubiertos = Math.max(0, Math.round((hastaEfectivo - desdeEfectivo) / MS_POR_DIA) + 1);

    return {
        DiasCubiertos: cubiertos,
        DiasPeriodo: diasPeriodo,
        Parcial: cubiertos < diasPeriodo,
    };
}

/**
 * Convierte a Date lo que viaja en una serie de tiempo, respetando el calendario
 * local.
 *
 * Una fecha sola ("2026-10-01") la especificación manda parsearla como medianoche
 * UTC: en México eso cae el 30 de septiembre a las 18:00, y cualquier etiqueta de
 * mes se recorre un mes hacia atrás. Agrupado por mes el API manda justo ese
 * formato (viene de DATE_FORMAT), mientras que por día y por semana manda un DATE
 * que se serializa con la hora local incluida — por eso solo el eje de meses salía
 * corrido. Las que ya traen hora se parsean tal cual.
 */
export function aFechaLocal(valor: string | Date): Date {
    if (valor instanceof Date) return valor;
    const texto = String(valor);
    const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
    if (!soloFecha) return new Date(texto);
    return new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]));
}


/** Contra qué se compara el periodo consultado. */
export type BaseComparativa = 'anterior' | 'mes' | 'anio';

export interface RangoFechas {
    inicio: string;
    fin: string;
}

/** YYYY-MM-DD de unos componentes de calendario, recortando el día al mes real. */
function aTexto(anio: number, mes: number, dia: number): string {
    // El dia 0 del mes siguiente es el ultimo del actual: asi se recorta un
    // 31 de octubre que viaja a septiembre, o un 29 de febrero bisiesto.
    const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    const d = new Date(Date.UTC(anio, mes, Math.min(dia, ultimoDia)));
    return d.toISOString().slice(0, 10);
}

/** Suma (o resta) días a una fecha de calendario. */
function sumarDias(fecha: string, dias: number): string {
    return new Date(aUtc(fecha) + dias * MS_POR_DIA).toISOString().slice(0, 10);
}

/** Mueve una fecha `meses` hacia atrás, recortando el día si el mes destino es más corto. */
function restarMeses(fecha: string, meses: number): string {
    const anio = Number(fecha.slice(0, 4));
    const mes = Number(fecha.slice(5, 7)) - 1;
    const dia = Number(fecha.slice(8, 10));
    const destino = new Date(Date.UTC(anio, mes - meses, 1));
    return aTexto(destino.getUTCFullYear(), destino.getUTCMonth(), dia);
}

/**
 * Rango contra el que se compara el periodo consultado.
 *
 *   anterior  el bloque de los mismos días inmediatamente antes. Es una ventana
 *             deslizante: "lo que va del mes" se compara contra la segunda
 *             quincena del mes pasado, no contra el mes pasado completo.
 *   mes       las mismas fechas del mes anterior.
 *   anio      las mismas fechas del año anterior.
 */
export function periodoComparativo(inicio: string, fin: string, base: BaseComparativa): RangoFechas {
    if (base === 'mes') {
        return { inicio: restarMeses(inicio, 1), fin: restarMeses(fin, 1) };
    }
    if (base === 'anio') {
        return { inicio: restarMeses(inicio, 12), fin: restarMeses(fin, 12) };
    }
    const dias = Math.round((aUtc(fin) - aUtc(inicio)) / MS_POR_DIA) + 1;
    const finAnterior = sumarDias(inicio, -1);
    return { inicio: sumarDias(finAnterior, -(dias - 1)), fin: finAnterior };
}

/** Lee el parámetro de la petición; cualquier cosa rara cae en el deslizante. */
export function baseComparativa(valor: string | null): BaseComparativa {
    return valor === 'mes' || valor === 'anio' ? valor : 'anterior';
}

/** Hoy en YYYY-MM-DD, en la zona del servidor. */
export function hoyCalendario(): string {
    return aFechaCalendario(new Date());
}
