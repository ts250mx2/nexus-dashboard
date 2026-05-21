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

        let sql = `
            SELECT
                A.IdArticulo,
                A.Codigo,
                A.Descripcion as Articulo,
                SUM(DV.Cantidad) as Cantidad,
                SUM(DV.PrecioVenta * DV.Cantidad) as Total,
                COUNT(DISTINCT V.IdVenta) as NumeroTickets,
                SUM(DV.PrecioVenta * DV.Cantidad) / COUNT(DISTINCT V.IdVenta) as TicketPromedio
            FROM tblDetalleVentas DV
            INNER JOIN tblVentas V ON DV.IdVenta = V.IdVenta AND DV.IdSucursal = V.IdSucursal
            INNER JOIN tblArticulos A ON DV.IdArticulo = A.IdArticulo
            WHERE V.FechaVenta BETWEEN ? AND ? AND V.Status = 0
        `;

        const params: any[] = [startDate + ' 00:00:00', endDate + ' 23:59:59'];

        if (sucursalId && sucursalId !== 'all' && sucursalId !== '') {
            sql += ` AND V.IdSucursal = ?`;
            params.push(sucursalId);
        }

        sql += ` GROUP BY A.IdArticulo, A.Codigo, A.Descripcion ORDER BY Total DESC`;

        const rows = await query(sql, params);
        return NextResponse.json({ success: true, data: rows });
    } catch (error: any) {
        console.error('Error in API /reportes/productos:', error);
        return NextResponse.json({ error: 'Database error fetching products summary' }, { status: 500 });
    }
}
