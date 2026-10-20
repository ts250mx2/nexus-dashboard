/**
 * Comparación de cierres de inventario. Lógica pura: no toca la base ni el DOM.
 *
 * Un "cierre" es la foto del inventario de una sucursal tomada al final del día
 * (existencia inicial = corte del ERP, entradas/salidas del día, existencia
 * final). La comparación pone en fila los últimos cierres y el inventario de hoy
 * en vivo, y verifica cada transición entre dos columnas consecutivas:
 *
 *   corte del ERP con que abre la columna B  ==  existencia final con que cerró la columna A
 *
 * Son dos cálculos independientes: el cierre A lo calculó el portal al momento
 * (corte + documentos en vivo) y el corte de B lo recalculó el ERP en su corrida
 * nocturna desde el último conteo físico. Si coinciden, el inventario del día
 * está bien; si no, la diferencia queda expuesta artículo por artículo.
 *
 * La transición solo es verificable si el corte de B es el corte INMEDIATO al
 * cierre A (`corteRenovado`): el ERP lo generó después de tomar el cierre A y su
 * medianoche es la que sigue a ese cierre. Si el ERP no corrió esa noche, la
 * columna B arranca del mismo corte que A; si falta el cierre de un día
 * intermedio, el corte de B incluye los movimientos del día perdido. En ambos
 * casos no hay verificación independiente y se informa en lugar de fingir que
 * cuadra o de inventar diferencias.
 *
 * Si la existencia inicial de B viene de un conteo físico capturado después del
 * corte (Fuente = 'conteo'), tampoco es comparable con el cierre A: el conteo ya
 * absorbió los movimientos del día hasta esa hora. Se marca 'conteo'.
 */

export interface DetalleCierre {
    IdArticulo: number;
    Codigo: string;
    Descripcion: string;
    Marca: string;
    Depto: string;
    ExiInicial: number;
    Entradas: number;
    Salidas: number;
    ExiFinal: number;
    Costo: number;
    Consignacion: number;
    /** De dónde salió ExiInicial: corte del ERP ('movimientos'), conteo físico o tblCostoInventario. */
    Fuente?: 'movimientos' | 'conteo' | 'costo';
}

/** Cierre guardado de un día. */
export interface CierreDia {
    fecha: string;
    generadoEn: string;
    fechaCorteERP: string | null;
    /** Hora real en que el ERP generó ese corte (UPDATE_TIME de tblReporteMovimientos). */
    corteGeneradoEn?: string | null;
    detalle: DetalleCierre[];
}

/** Inventario de hoy calculado en vivo. */
export interface HoyEnVivo {
    /** Fecha LOCAL de hoy ('YYYY-MM-DD'); no se deriva de calculadoEn porque ese ISO va en UTC. */
    fecha: string;
    calculadoEn: string;
    fechaCorteERP: string | null;
    corteGeneradoEn?: string | null;
    detalle: DetalleCierre[];
}

import type { ConsignacionesPorDia } from './consignaciones';

export type EstadoTransicion = 'cuadra' | 'diferencia' | 'conteo' | 'sin_verificacion' | 'sin_dato';

const HORA_MS = 3_600_000;
/** El corte de B debe ser la medianoche inmediata al cierre A: como mucho 24 h después... */
const MAX_HORAS_ADYACENCIA = 24;
/** ...y, si el cierre A se tomó minutos después de medianoche, hasta 3 h antes de él. */
const MAX_HORAS_ATRAS = 3;

export interface ColumnaComparacion {
    clave: string;
    etiqueta: string;
    fecha: string;
    generadoEn: string;
    fechaCorteERP: string | null;
    corteGeneradoEn: string | null;
    esHoy: boolean;
    /** El corte con que abre esta columna es el inmediato posterior al cierre de la anterior. */
    corteRenovado: boolean;
}

export interface CeldaComparacion {
    exiInicial: number | null;
    entradas: number;
    salidas: number;
    exiFinal: number | null;
    /** Verificación contra la columna anterior (la primera columna no tiene). */
    estado: EstadoTransicion;
    /** exiInicial de esta columna − exiFinal de la anterior (null si no se puede). */
    diferencia: number | null;
    /**
     * Unidades de consignación que explican la diferencia por completo. Solo se
     * llena cuando coincide al dedillo: si no cuadra exacto es una diferencia de
     * verdad y se deja como tal, en lugar de taparla.
     */
    consignacion?: number;
}

export type EstadoFila = 'cuadra' | 'diferencia' | 'consignacion' | 'sin_verificacion';

export interface FilaComparacion {
    IdArticulo: number;
    Codigo: string;
    Descripcion: string;
    Marca: string;
    Depto: string;
    Costo: number;
    celdas: CeldaComparacion[];
    estado: EstadoFila;
    /** Suma de |diferencia| en todas las transiciones verificables. */
    diferenciaTotal: number;
}

export interface ResumenTransicion {
    de: string;
    a: string;
    corteRenovado: boolean;
    comparados: number;
    cuadran: number;
    conDiferencia: number;
    /** De los anteriores, los que explica una consignación movida ese día. */
    porConsignacion: number;
    /** Unidades de los explicados por consignación. */
    unidadesConsignacion: number;
    /** Artículos con conteo físico ese día (base = conteo, no comparable). */
    conConteo: number;
    unidadesDiferencia: number;
}

export interface Comparacion {
    columnas: ColumnaComparacion[];
    transiciones: ResumenTransicion[];
    filas: FilaComparacion[];
    kpis: {
        articulos: number;
        cuadran: number;
        conDiferencia: number;
        porConsignacion: number;
        sinVerificacion: number;
        unidadesDiferencia: number;
        unidadesConsignacion: number;
        valorDiferencia: number;
    };
}

const EPSILON = 1e-6;
const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

function tiempo(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : null;
}

/**
 * ¿El corte con que abre B es el inmediato posterior al cierre A?
 *   1. El ERP lo generó DESPUÉS de tomar el cierre A (hora real; si no se conoce,
 *      se usa la medianoche nominal del corte).
 *   2. Su medianoche nominal está pegada al cierre A: no más de 24 h después
 *      (si hubiera un día sin cierre en medio, el corte ya traería los movimientos
 *      de ese día) ni más de 3 h antes (cierre tomado minutos después de las 00:00).
 */
function esCorteInmediato(actual: ColumnaInterna, previa: ColumnaInterna): boolean {
    const cierreA = tiempo(previa.generadoEn);
    const corteNominal = tiempo(actual.fechaCorteERP);
    if (cierreA === null || corteNominal === null) return false;

    const generado = tiempo(actual.corteGeneradoEn) ?? corteNominal;
    if (generado <= cierreA) return false;

    const desfase = corteNominal - cierreA;
    return desfase > -MAX_HORAS_ATRAS * HORA_MS && desfase < MAX_HORAS_ADYACENCIA * HORA_MS;
}

function etiquetaFecha(fecha: string): string {
    const d = new Date(`${fecha}T00:00:00`);
    if (Number.isNaN(d.getTime())) return fecha;
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

interface ColumnaInterna extends ColumnaComparacion {
    porArticulo: Map<number, DetalleCierre>;
}

function armarColumnas(dias: CierreDia[], hoy: HoyEnVivo | null): ColumnaInterna[] {
    const ordenados = [...dias].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const columnas: ColumnaInterna[] = ordenados.map(d => ({
        clave: d.fecha,
        etiqueta: `Cierre ${etiquetaFecha(d.fecha)}`,
        fecha: d.fecha,
        generadoEn: d.generadoEn,
        fechaCorteERP: d.fechaCorteERP,
        corteGeneradoEn: d.corteGeneradoEn ?? null,
        esHoy: false,
        corteRenovado: false,
        porArticulo: new Map(d.detalle.map(r => [r.IdArticulo, r])),
    }));

    if (hoy) {
        columnas.push({
            clave: 'hoy',
            etiqueta: 'Hoy (en vivo)',
            fecha: hoy.fecha,
            generadoEn: hoy.calculadoEn,
            fechaCorteERP: hoy.fechaCorteERP,
            corteGeneradoEn: hoy.corteGeneradoEn ?? null,
            esHoy: true,
            corteRenovado: false,
            porArticulo: new Map(hoy.detalle.map(r => [r.IdArticulo, r])),
        });
    }

    return columnas.map((c, i) => ({
        ...c,
        corteRenovado: i > 0 && esCorteInmediato(c, columnas[i - 1]),
    }));
}

function celda(
    actual: DetalleCierre | undefined,
    previo: DetalleCierre | undefined,
    columna: ColumnaInterna,
    esPrimera: boolean,
    /** Efecto de la consignación sobre el cierre del día que se está verificando. */
    efectoConsignacion = 0
): CeldaComparacion {
    const base: CeldaComparacion = {
        exiInicial: actual ? num(actual.ExiInicial) : null,
        entradas: actual ? num(actual.Entradas) : 0,
        salidas: actual ? num(actual.Salidas) : 0,
        exiFinal: actual ? num(actual.ExiFinal) : null,
        estado: 'sin_dato',
        diferencia: null,
    };
    if (esPrimera || !actual || !previo) return base;
    if (!columna.corteRenovado) return { ...base, estado: 'sin_verificacion' };
    if (actual.Fuente === 'conteo') return { ...base, estado: 'conteo' };

    const diferencia = num(actual.ExiInicial) - num(previo.ExiFinal);
    if (Math.abs(diferencia) < EPSILON) return { ...base, diferencia, estado: 'cuadra' };

    // El portal mueve la consignación y el ERP no siempre, así que la diferencia
    // del día siguiente es ese efecto con el signo cambiado. Cuando coincide
    // exacto, la mercancía está completa y lo que sobra es la regla, no el stock.
    const explicada = efectoConsignacion !== 0 && Math.abs(diferencia + efectoConsignacion) < EPSILON;
    return {
        ...base,
        diferencia,
        estado: 'diferencia',
        ...(explicada ? { consignacion: Math.abs(efectoConsignacion) } : {}),
    };
}

function estadoFila(celdas: CeldaComparacion[]): EstadoFila {
    const diferencias = celdas.filter(c => c.estado === 'diferencia');
    if (diferencias.length > 0) {
        // Si TODAS se explican por consignación, la fila no es un faltante.
        return diferencias.every(c => c.consignacion !== undefined) ? 'consignacion' : 'diferencia';
    }
    if (celdas.some(c => c.estado === 'cuadra')) return 'cuadra';
    return 'sin_verificacion';
}

/** Pone en fila los cierres (ascendente por fecha) y el inventario de hoy. */
export function compararCierres(
    dias: CierreDia[],
    hoy: HoyEnVivo | null,
    /** Efecto de la consignación por fecha y artículo; sin él nada se marca. */
    consignaciones: ConsignacionesPorDia = new Map()
): Comparacion {
    const columnas = armarColumnas(dias, hoy);

    const catalogo = new Map<number, DetalleCierre>();
    for (const c of columnas) {
        for (const r of c.porArticulo.values()) catalogo.set(r.IdArticulo, r);
    }

    const filas: FilaComparacion[] = [...catalogo.values()]
        .sort((a, b) => a.Descripcion.localeCompare(b.Descripcion, 'es-MX') || a.Codigo.localeCompare(b.Codigo))
        .map(ref => {
            const celdas = columnas.map((col, i) => {
                // La consignación que desajusta esta transición se movió el día de
                // la columna ANTERIOR: es el día que se está cerrando.
                const diaCerrado = i > 0 ? columnas[i - 1].fecha : '';
                const efecto = consignaciones.get(diaCerrado)?.get(ref.IdArticulo) ?? 0;
                return celda(
                    col.porArticulo.get(ref.IdArticulo),
                    i > 0 ? columnas[i - 1].porArticulo.get(ref.IdArticulo) : undefined,
                    col,
                    i === 0,
                    efecto
                );
            });
            return {
                IdArticulo: ref.IdArticulo,
                Codigo: ref.Codigo,
                Descripcion: ref.Descripcion,
                Marca: ref.Marca,
                Depto: ref.Depto,
                Costo: num(ref.Costo),
                celdas,
                estado: estadoFila(celdas),
                diferenciaTotal: celdas.reduce((acc, c) => acc + Math.abs(c.diferencia ?? 0), 0),
            };
        });

    const transiciones: ResumenTransicion[] = columnas.slice(1).map((col, idx) => {
        const i = idx + 1;
        const celdasCol = filas.map(f => f.celdas[i]);
        const verificables = celdasCol.filter(c => c.estado === 'cuadra' || c.estado === 'diferencia');
        return {
            de: columnas[i - 1].clave,
            a: col.clave,
            corteRenovado: col.corteRenovado,
            comparados: verificables.length,
            cuadran: verificables.filter(c => c.estado === 'cuadra').length,
            conDiferencia: verificables.filter(c => c.estado === 'diferencia').length,
            porConsignacion: verificables.filter(c => c.consignacion !== undefined).length,
            unidadesConsignacion: verificables.reduce((acc, c) => acc + (c.consignacion ?? 0), 0),
            conConteo: celdasCol.filter(c => c.estado === 'conteo').length,
            unidadesDiferencia: verificables.reduce((acc, c) => acc + Math.abs(c.diferencia ?? 0), 0),
        };
    });

    const kpis = {
        articulos: filas.length,
        cuadran: filas.filter(f => f.estado === 'cuadra').length,
        conDiferencia: filas.filter(f => f.estado === 'diferencia').length,
        porConsignacion: filas.filter(f => f.estado === 'consignacion').length,
        sinVerificacion: filas.filter(f => f.estado === 'sin_verificacion').length,
        unidadesDiferencia: filas.reduce((acc, f) => acc + f.diferenciaTotal, 0),
        unidadesConsignacion: filas.reduce(
            (acc, f) => acc + f.celdas.reduce((a, c) => a + (c.consignacion ?? 0), 0), 0),
        valorDiferencia: filas.reduce((acc, f) => acc + f.diferenciaTotal * f.Costo, 0),
    };

    return {
        columnas: columnas.map(c => {
            const { porArticulo: _omitido, ...publica } = c;
            void _omitido;
            return publica;
        }),
        transiciones,
        filas,
        kpis,
    };
}

/** Filtros de la vista: búsqueda por palabras y interruptores. */
export interface FiltrosComparacion {
    search: string;
    soloDiferencias: boolean;
    soloNegativos: boolean;
}

function normalizar(texto: string): string {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

export function filtrarComparacion(filas: FilaComparacion[], filtros: FiltrosComparacion): FilaComparacion[] {
    const tokens = normalizar(filtros.search.trim()).split(/\s+/).filter(Boolean).slice(0, 6);
    return filas.filter(f => {
        if (filtros.soloDiferencias && f.estado !== 'diferencia') return false;
        if (filtros.soloNegativos && !f.celdas.some(c => (c.exiFinal ?? 0) < 0)) return false;
        if (tokens.length === 0) return true;
        const texto = normalizar(`${f.Codigo} ${f.Descripcion} ${f.Marca}`);
        return tokens.every(t => texto.includes(t));
    });
}
