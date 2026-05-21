import { NextResponse } from 'next/server';
import { query } from '@/lib/db';


export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const sucursalId = searchParams.get('sucursalId');

        if (!startDate || !endDate) {
            return NextResponse.json({ error: 'Missing date parameters' }, { status: 400 });
        }

        const dateStart = startDate + ' 00:00:00';
        const dateEnd = endDate + ' 23:59:59';

        let sql = `
            SELECT 
                S.IdSucursal,
                S.Sucursal as Nombre,
                COALESCE(P.TotalProductos, 0) as TotalProductos,
                COALESCE(V.TotalVenta, 0) as TotalVenta,
                COALESCE(V.TicketPromedio, 0) as TicketPromedio
            FROM tblSucursales S
            LEFT JOIN (
                SELECT 
                    V.IdSucursal,
                    SUM(V.Total) as TotalVenta,
                    SUM(V.Total) / COUNT(V.IdVenta) as TicketPromedio
                FROM tblVentas V
                WHERE V.FechaVenta BETWEEN ? AND ? AND V.Status = 0
                GROUP BY V.IdSucursal
            ) V ON S.IdSucursal = V.IdSucursal
            LEFT JOIN (
                SELECT 
                    V.IdSucursal,
                    COUNT(DISTINCT DV.IdArticulo) as TotalProductos
                FROM tblDetalleVentas DV
                INNER JOIN tblVentas V ON DV.IdVenta = V.IdVenta AND DV.IdSucursal = V.IdSucursal
                WHERE V.FechaVenta BETWEEN ? AND ? AND V.Status = 0
                GROUP BY V.IdSucursal
            ) P ON S.IdSucursal = P.IdSucursal
            WHERE S.Status = 0 AND S.EsVenta = 1
        `;

        const params: any[] = [dateStart, dateEnd, dateStart, dateEnd];

        if (sucursalId && sucursalId !== 'all' && sucursalId !== '') {
            const ids = sucursalId.split(',').filter(id => id.trim() !== '');
            if (ids.length > 0) {
                const placeholders = ids.map(() => '?').join(',');
                sql += ` AND S.IdSucursal IN (${placeholders})`;
                params.push(...ids);
            }
        }

        sql += ` ORDER BY TotalVenta DESC`;

        const branchesList = await query(sql, params) as any[];

        // Calculate accurate global metrics directly from the database
        const globalVentaSql = `
            SELECT 
                SUM(Total) as TotalVenta,
                SUM(Total) / COUNT(IdVenta) as TicketPromedio
            FROM tblVentas
            WHERE FechaVenta BETWEEN ? AND ? AND Status = 0
        `;
        const globalVentaRows = await query(globalVentaSql, [dateStart, dateEnd]) as any[];
        const globalVenta = globalVentaRows[0]?.TotalVenta || 0;
        const globalTicketPromedio = globalVentaRows[0]?.TicketPromedio || 0;

        const globalProductsSql = `
            SELECT COUNT(DISTINCT DV.IdArticulo) as TotalProductos
            FROM tblDetalleVentas DV
            INNER JOIN tblVentas V ON DV.IdVenta = V.IdVenta AND DV.IdSucursal = V.IdSucursal
            WHERE V.FechaVenta BETWEEN ? AND ? AND V.Status = 0
        `;
        const globalProductsRows = await query(globalProductsSql, [dateStart, dateEnd]) as any[];
        const globalProductos = globalProductsRows[0]?.TotalProductos || 0;

        return NextResponse.json({
            success: true,
            data: branchesList,
            global: {
                TotalVenta: globalVenta,
                TotalProductos: globalProductos,
                TicketPromedio: globalTicketPromedio
            }
        });
    } catch (error: any) {
        console.error('Error in API /reportes/productos/sucursales:', error);
        return NextResponse.json({ error: 'Database error fetching branch product summary' }, { status: 500 });
    }
}
