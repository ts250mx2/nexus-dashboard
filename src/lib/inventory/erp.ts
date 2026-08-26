import { toIso } from '@/lib/dates';
import { query } from '@/lib/db';

/**
 * Estado de la corrida nocturna del ERP, compartido por el reporte de
 * existencias y por los cierres de inventario.
 */

/**
 * Cuándo regeneró el ERP la tabla de movimientos. En MyISAM, UPDATE_TIME es la
 * fecha de modificación del archivo de datos, así que refleja la última escritura.
 */
export async function fechaGeneracionMovimientos(): Promise<string | null> {
    const rows = (await query(
        `SELECT UPDATE_TIME AS UpdateTime
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tblReporteMovimientos'`
    )) as { UpdateTime: unknown }[];
    return toIso(rows[0]?.UpdateTime);
}

/** Fecha del corte tipo 99 más común entre las filas (normalmente es una sola). */
export function fechaCorteComun(rows: { FechaCorte: unknown }[]): string | null {
    const conteo = new Map<string, number>();
    for (const r of rows) {
        const clave = toIso(r.FechaCorte);
        if (!clave) continue;
        conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    }
    let mejor: string | null = null;
    let mejorConteo = 0;
    for (const [fecha, n] of conteo) {
        if (n > mejorConteo) {
            mejor = fecha;
            mejorConteo = n;
        }
    }
    return mejor;
}
