import { query } from '@/lib/db';

/**
 * Consignaciones que se movieron cada día, por artículo.
 *
 * Sirve para explicar diferencias del cierre, no para calcular existencia. El
 * portal trata la consignación como movimiento de existencia (la resta al salir
 * y la devuelve al cerrarse) y el ERP no lo hace de forma consistente: medido
 * sobre la consignación 633 de MONTERREY, de sus 367 renglones el ERP devolvió
 * la mercancía en 156 e ignoró los otros 211, dentro del mismo documento y sin
 * un atributo que los separe.
 *
 * Mientras esa regla no esté clara, el día en que una consignación se cierra
 * aparecen diferencias que no son faltantes. Con esto el tablero las puede
 * señalar en lugar de mandar a nadie a contar mercancía que está completa.
 */

/**
 * Efecto NETO que la consignación tuvo sobre el cierre del portal ese día, por
 * artículo: positivo cuando el portal devolvió mercancía (consignación cerrada)
 * y negativo cuando la sacó (consignación abierta). La diferencia que el tablero
 * reporta al día siguiente es justo ese efecto con el signo cambiado.
 */
export type ConsignacionesDelDia = Map<number, number>;

/** Por fecha ('YYYY-MM-DD') y dentro de ella por artículo. */
export type ConsignacionesPorDia = Map<string, ConsignacionesDelDia>;

interface FilaConsignacion {
    Fecha: unknown;
    IdArticulo: unknown;
    Unidades: unknown;
}

function aFecha(valor: unknown): string {
    if (valor instanceof Date) {
        const mes = String(valor.getMonth() + 1).padStart(2, '0');
        const dia = String(valor.getDate()).padStart(2, '0');
        return `${valor.getFullYear()}-${mes}-${dia}`;
    }
    return String(valor ?? '').slice(0, 10);
}

/**
 * Movimientos de consignación de la sucursal desde `desde` (inclusive).
 *
 * Cuenta las dos puntas, porque las dos pueden desajustar un cierre:
 *   - la que se ABRE ese día saca mercancía (el portal la resta, va en negativo);
 *   - la que se CIERRA o se cancela la devuelve (el portal la suma, va en positivo).
 * La unidad de medida es `CantidadSalida`, que es lo que el portal movió.
 */
export async function consignacionesPorDia(sucursal: number, desde: string): Promise<ConsignacionesPorDia> {
    if (!Number.isInteger(sucursal) || sucursal <= 0) return new Map();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return new Map();

    const sql = `
        SELECT DATE_FORMAT(Fecha, '%Y-%m-%d') AS Fecha, IdArticulo, SUM(Unidades) AS Unidades
        FROM (
            -- Cerradas o canceladas: el portal devuelve la mercancía ese día.
            SELECT DATE(B.FechaAct) AS Fecha, A.IdArticulo, A.CantidadSalida AS Unidades
            FROM tblConsignaciones B
            INNER JOIN tblDetalleConsignaciones A
                    ON A.IdConsignacion = B.IdConsignacion AND A.IdSucursal = B.IdSucursal
            WHERE B.IdSucursal = ?
              AND (B.Cerrada > 0 OR B.Status <> 0)
              AND DATE(B.FechaAct) >= ?

            UNION ALL

            -- Abiertas: el portal saca la mercancía ese día.
            SELECT DATE(B.FechaConsignacion), A.IdArticulo, -A.CantidadSalida
            FROM tblConsignaciones B
            INNER JOIN tblDetalleConsignaciones A
                    ON A.IdConsignacion = B.IdConsignacion AND A.IdSucursal = B.IdSucursal
            WHERE B.IdSucursal = ?
              AND B.Status = 0 AND B.Cerrada = 0
              AND DATE(B.FechaConsignacion) >= ?
        ) movimientos
        GROUP BY Fecha, IdArticulo
        HAVING SUM(Unidades) <> 0
    `;

    const filas = (await query(sql, [sucursal, desde, sucursal, desde])) as FilaConsignacion[];

    const porDia: ConsignacionesPorDia = new Map();
    for (const fila of filas) {
        const fecha = aFecha(fila.Fecha);
        const articulo = Number(fila.IdArticulo);
        const unidades = Number(fila.Unidades);
        if (!fecha || !Number.isFinite(articulo) || !Number.isFinite(unidades)) continue;

        const delDia = porDia.get(fecha) ?? new Map<number, number>();
        delDia.set(articulo, (delDia.get(articulo) ?? 0) + unidades);
        porDia.set(fecha, delDia);
    }
    return porDia;
}
