import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * KPIs de compras + traspasos por sucursal en un periodo dado.
 *
 * Convenciones:
 *  - "Compras" = órdenes de compra a proveedor (IdTraspaso = 0).
 *  - "Traspasos" = movimientos internos entre sucursales (tblTraspasos).
 *  - Agrupación por sucursal:
 *      Compras → IdSucursal (sucursal destino de la OC)
 *      Traspasos → IdSucursalDestino (donde llega la mercancía)
 *  - "Recibida/o" = la sucursal ya marcó recepción (IdUsuarioRecibo > 0).
 *  - "Pendiente"  = sin recibir aún (IdUsuarioRecibo = 0) y no cancelado.
 *  - Traspasos cancelados (Status <> 0) se excluyen del conteo.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        if (!startDate || !endDate) {
            return NextResponse.json({ error: 'Missing date parameters' }, { status: 400 });
        }

        const dateStart = `${startDate} 00:00:00`;
        const dateEnd = `${endDate} 23:59:59`;

        const sql = `
            SELECT
                S.IdSucursal,
                S.Sucursal AS Nombre,
                COALESCE(C.Recibidas, 0) AS ComprasRecibidas,
                COALESCE(C.MontoRecibidas, 0) AS ComprasRecibidasMonto,
                COALESCE(C.Pendientes, 0) AS ComprasPendientes,
                COALESCE(C.MontoPendientes, 0) AS ComprasPendientesMonto,
                COALESCE(T.Recibidos, 0) AS TraspasosRecibidos,
                COALESCE(T.MontoRecibidos, 0) AS TraspasosRecibidosMonto,
                COALESCE(T.Pendientes, 0) AS TraspasosPendientes,
                COALESCE(T.MontoPendientes, 0) AS TraspasosPendientesMonto
            FROM tblSucursales S
            LEFT JOIN (
                SELECT
                    IdSucursal,
                    SUM(CASE WHEN COALESCE(IdUsuarioRecibo, 0) > 0 THEN 1 ELSE 0 END) AS Recibidas,
                    SUM(CASE WHEN COALESCE(IdUsuarioRecibo, 0) > 0 THEN Total ELSE 0 END) AS MontoRecibidas,
                    SUM(CASE WHEN COALESCE(IdUsuarioRecibo, 0) = 0 THEN 1 ELSE 0 END) AS Pendientes,
                    SUM(CASE WHEN COALESCE(IdUsuarioRecibo, 0) = 0 THEN Total ELSE 0 END) AS MontoPendientes
                FROM tblOrdenesCompra
                WHERE COALESCE(IdTraspaso, 0) = 0
                  AND FechaOrdenCompra BETWEEN ? AND ?
                GROUP BY IdSucursal
            ) C ON S.IdSucursal = C.IdSucursal
            LEFT JOIN (
                SELECT
                    IdSucursalDestino AS IdSucursal,
                    SUM(CASE WHEN COALESCE(IdUsuarioRecibo, 0) > 0 AND Status = 0 THEN 1 ELSE 0 END) AS Recibidos,
                    SUM(CASE WHEN COALESCE(IdUsuarioRecibo, 0) > 0 AND Status = 0 THEN Total ELSE 0 END) AS MontoRecibidos,
                    SUM(CASE WHEN COALESCE(IdUsuarioRecibo, 0) = 0 AND Status = 0 THEN 1 ELSE 0 END) AS Pendientes,
                    SUM(CASE WHEN COALESCE(IdUsuarioRecibo, 0) = 0 AND Status = 0 THEN Total ELSE 0 END) AS MontoPendientes
                FROM tblTraspasos
                WHERE FechaTraspaso BETWEEN ? AND ?
                GROUP BY IdSucursalDestino
            ) T ON S.IdSucursal = T.IdSucursal
            WHERE S.Status = 0
            ORDER BY S.Sucursal ASC
        `;

        const rows = await query(sql, [dateStart, dateEnd, dateStart, dateEnd]) as any[];

        // Global aggregates across all branches
        const global = rows.reduce(
            (acc, r) => {
                acc.ComprasRecibidas += Number(r.ComprasRecibidas) || 0;
                acc.ComprasRecibidasMonto += Number(r.ComprasRecibidasMonto) || 0;
                acc.ComprasPendientes += Number(r.ComprasPendientes) || 0;
                acc.ComprasPendientesMonto += Number(r.ComprasPendientesMonto) || 0;
                acc.TraspasosRecibidos += Number(r.TraspasosRecibidos) || 0;
                acc.TraspasosRecibidosMonto += Number(r.TraspasosRecibidosMonto) || 0;
                acc.TraspasosPendientes += Number(r.TraspasosPendientes) || 0;
                acc.TraspasosPendientesMonto += Number(r.TraspasosPendientesMonto) || 0;
                return acc;
            },
            {
                ComprasRecibidas: 0,
                ComprasRecibidasMonto: 0,
                ComprasPendientes: 0,
                ComprasPendientesMonto: 0,
                TraspasosRecibidos: 0,
                TraspasosRecibidosMonto: 0,
                TraspasosPendientes: 0,
                TraspasosPendientesMonto: 0
            }
        );

        return NextResponse.json({ success: true, data: rows, global });
    } catch (error: any) {
        console.error('Error in API /compras/global/sucursales:', error);
        return NextResponse.json({ error: 'Database error fetching compras global summary' }, { status: 500 });
    }
}
