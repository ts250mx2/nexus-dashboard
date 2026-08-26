/**
 * Cálculos puros del reporte de movimientos de un artículo (sin red ni DOM):
 * saldo por renglón, resumen por tipo de movimiento y filtro por tipo.
 * Replican `CargarMovimientos` y `Valoriza` de frmRepMovimientos (ERP VB6).
 *
 * El módulo no importa nada en tiempo de ejecución a propósito: así se prueba
 * directo con `node --test` sin transpilar (ver tests/lib/inventory).
 */

/** Tipo virtual que agrupa todos los movimientos en el resumen. */
export const TIPO_TODOS = -1;
/** Corte "INVENTARIO A FECHA": no es un movimiento, es el ancla de existencia. */
export const TIPO_CORTE = 99;

export const ETIQUETAS_TIPO: Readonly<Record<number, string>> = {
    [TIPO_TODOS]: 'TODOS',
    0: 'AJUSTES',
    1: 'VENTAS',
    2: 'RECIBOS',
    3: 'TRASPASOS SALIDA',
    4: 'TRASPASOS ENTRADA',
    5: 'DEVOLUCIONES',
    6: 'CONSIGNACIONES',
    [TIPO_CORTE]: 'INVENTARIO A FECHA',
};

export function etiquetaTipo(tipo: number): string {
    return ETIQUETAS_TIPO[tipo] ?? `TIPO ${tipo}`;
}

/** Lo mínimo que necesita cada renglón para calcular saldos y resumen. */
export interface MovimientoBase {
    TipoMovimiento: number;
    /** Cantidad con signo. En ajustes es la diferencia aplicada; en el corte es 0. */
    Mov: number;
    /** Fecha del movimiento en ISO 8601. */
    FechaMovimiento: string;
    /** Día calendario 'YYYY-MM-DD' de FechaMovimiento, tal como lo entrega la base. */
    Dia: string;
    /** 1 si el renglón se modificó en un día distinto al del movimiento. */
    Editado: number;
}

export interface CorteInfo {
    ExiCorte: number | null;
    FechaCorte: string | null;
}

export interface ResumenTipo {
    TipoMovimiento: number;
    Etiqueta: string;
    Folios: number;
    Cantidad: number;
    PromFolio: number | null;
    PromDia: number | null;
    FechaMin: string | null;
    FechaMax: string | null;
    Editados: number;
}

const MS_POR_DIA = 86_400_000;
/** Las cantidades son DOUBLE en la base; se redondea para no arrastrar ruido binario. */
const DECIMALES_SALDO = 6;

const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const redondear = (v: number): number => {
    const factor = 10 ** DECIMALES_SALDO;
    return Math.round(v * factor) / factor;
};

/** Días calendario entre dos fechas 'YYYY-MM-DD' (b − a). Entradas inválidas → 0. */
export function diasEntre(a: string, b: string): number {
    const ta = Date.parse(`${a}T00:00:00Z`);
    const tb = Date.parse(`${b}T00:00:00Z`);
    if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
    return Math.round((tb - ta) / MS_POR_DIA);
}

/**
 * Existencia ACTUAL del par artículo-sucursal: corte tipo 99 + movimientos
 * posteriores a su fecha (misma regla que la pantalla de existencias). Sin
 * corte se usa el respaldo de tblCostoInventario y, si tampoco hay, la suma de
 * los movimientos listados (arrancando de cero).
 */
export function existenciaActual(
    rows: readonly MovimientoBase[],
    corte: CorteInfo,
    exiRespaldo: number | null
): number {
    if (corte.ExiCorte !== null && corte.FechaCorte) {
        const tCorte = Date.parse(corte.FechaCorte);
        const posterior = rows
            .filter(r => r.TipoMovimiento !== TIPO_CORTE && Date.parse(r.FechaMovimiento) > tCorte)
            .reduce((acc, r) => acc + num(r.Mov), 0);
        return redondear(num(corte.ExiCorte) + posterior);
    }
    if (exiRespaldo !== null) return num(exiRespaldo);
    return redondear(rows.reduce((acc, r) => acc + num(r.Mov), 0));
}

/**
 * Saldo DESPUÉS de cada movimiento. Recorre la lista (ordenada por fecha
 * ascendente) de atrás hacia adelante partiendo de la existencia actual, que
 * es exactamente lo que hace el ERP (`rs.MoveLast` … `vlExi = vlExi - Mov`).
 * Devuelve copias nuevas; no toca la entrada.
 */
export function calcularSaldos<T extends MovimientoBase>(
    rows: readonly T[],
    exiFinal: number
): (T & { Exi: number })[] {
    const conSaldo: (T & { Exi: number })[] = [];
    let saldo = num(exiFinal);
    for (let i = rows.length - 1; i >= 0; i -= 1) {
        conSaldo.push({ ...rows[i], Exi: saldo });
        saldo = redondear(saldo - num(rows[i].Mov));
    }
    return conSaldo.reverse();
}

function resumir(tipo: number, rows: readonly MovimientoBase[], dias: number): ResumenTipo {
    const folios = rows.length;
    const cantidad = redondear(rows.reduce((acc, r) => acc + num(r.Mov), 0));
    // ISO 8601 en la misma zona ordena bien como texto.
    const fechas = rows.map(r => r.FechaMovimiento).filter(Boolean).sort();
    return {
        TipoMovimiento: tipo,
        Etiqueta: etiquetaTipo(tipo),
        Folios: folios,
        Cantidad: cantidad,
        PromFolio: folios > 0 ? cantidad / folios : null,
        PromDia: folios > 0 ? cantidad / dias : null,
        FechaMin: fechas[0] ?? null,
        FechaMax: fechas[fechas.length - 1] ?? null,
        Editados: rows.reduce((acc, r) => acc + (num(r.Editado) ? 1 : 0), 0),
    };
}

/**
 * Resumen por tipo de movimiento: TODOS primero y luego cada tipo presente en
 * orden numérico. El corte (99) no es un movimiento y no se cuenta.
 * "Promedio × día" divide entre los días calendario que abarca la lista
 * completa (primer y último renglón, corte incluido), como en el ERP; mínimo 1.
 */
export function resumirPorTipo(rows: readonly MovimientoBase[]): ResumenTipo[] {
    const movimientos = rows.filter(r => r.TipoMovimiento !== TIPO_CORTE);
    if (movimientos.length === 0) return [];

    const dias = rows.map(r => r.Dia).filter(Boolean).sort();
    const span = Math.max(1, diasEntre(dias[0], dias[dias.length - 1]));

    const tipos = [...new Set(movimientos.map(r => r.TipoMovimiento))].sort((a, b) => a - b);
    return [
        resumir(TIPO_TODOS, movimientos, span),
        ...tipos.map(t => resumir(t, movimientos.filter(r => r.TipoMovimiento === t), span)),
    ];
}

/** Renglones del tipo elegido. TODOS devuelve la lista completa, corte incluido. */
export function filtrarPorTipo<T extends MovimientoBase>(rows: readonly T[], tipo: number): T[] {
    if (tipo === TIPO_TODOS) return [...rows];
    return rows.filter(r => r.TipoMovimiento === tipo);
}
