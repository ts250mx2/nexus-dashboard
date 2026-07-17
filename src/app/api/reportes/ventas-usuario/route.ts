import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Reporte de ventas por usuario (cajero).
 *
 * Agrupa las ventas válidas del periodo por usuario + sucursal y devuelve
 * número de ventas, importe total, ticket promedio y última venta.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const sucursalId = searchParams.get('sucursalId');

        if (!startDate || !endDate) {
            return NextResponse.json({ error: 'Missing date parameters' }, { status: 400 });
        }

        let sql = `
            SELECT
                U.IdUsuario,
                U.Usuario,
                SUC.IdSucursal,
                SUC.Sucursal,
                COUNT(V.IdVenta) as TotalVentas,
                SUM(V.Total) as ImporteTotal,
                SUM(V.Total) / COUNT(V.IdVenta) as TicketPromedio,
                MAX(V.FechaVenta) as UltimaVenta
            FROM tblVentas V
            INNER JOIN tblUsuarios U ON V.IdUsuarioVenta = U.IdUsuario
            INNER JOIN tblSucursales SUC ON V.IdSucursal = SUC.IdSucursal
            WHERE V.Status = 0
              AND V.FechaVenta BETWEEN ? AND ?
        `;

        const params: any[] = [startDate + ' 00:00:00', endDate + ' 23:59:59'];

        if (sucursalId && sucursalId !== 'all' && sucursalId !== '') {
            const ids = sucursalId.split(',').filter(id => id.trim() !== '');
            if (ids.length > 0) {
                const placeholders = ids.map(() => '?').join(',');
                sql += ` AND V.IdSucursal IN (${placeholders})`;
                params.push(...ids);
            }
        }

        sql += ` GROUP BY U.IdUsuario, U.Usuario, SUC.IdSucursal, SUC.Sucursal ORDER BY ImporteTotal DESC`;

        const rows = await query(sql, params);
        return NextResponse.json({ success: true, data: rows });
    } catch (error: any) {
        console.error('Error in API /reportes/ventas-usuario:', error);
        return NextResponse.json({ error: 'Database error fetching user sales report' }, { status: 500 });
    }
}
