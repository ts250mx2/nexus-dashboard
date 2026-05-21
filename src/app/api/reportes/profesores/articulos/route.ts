import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const idSocio = searchParams.get('idSocio');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const sucursalId = searchParams.get('sucursalId');

        if (!idSocio || !startDate || !endDate) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        let sql = `
            SELECT
                A.IdArticulo,
                A.Descripcion as Articulo,
                SUM(DV.Cantidad) as Cantidad,
                SUM(DV.PrecioVenta*DV.Cantidad) as Total,
                COUNT(DISTINCT V.IdVenta) as NumeroTickets,
                SUM(DV.PrecioVenta*DV.Cantidad) / COUNT(DISTINCT V.IdVenta) as TicketPromedio
            FROM tblDetalleVentas DV
            INNER JOIN tblVentas V ON DV.IdVenta = V.IdVenta AND DV.IdSucursal = V.IdSucursal
            INNER JOIN tblArticulos A ON DV.IdArticulo = A.IdArticulo
            WHERE V.IdSocio = ?
              AND V.FechaVenta BETWEEN ? AND ?
        `;

        const params: any[] = [idSocio, `${startDate} 00:00:00`, `${endDate} 23:59:59`];

        if (sucursalId && sucursalId !== 'all') {
            sql += ` AND V.IdSucursal = ?`;
            params.push(sucursalId);
        }

        sql += ` GROUP BY A.IdArticulo, A.Descripcion ORDER BY Total DESC`;

        const rows = await query(sql, params);
        return NextResponse.json({ success: true, data: rows });
    } catch (error: any) {
        console.error('Error in API /reportes/profesores/articulos:', error);
        return NextResponse.json({ error: 'Database error fetching article summary' }, { status: 500 });
    }
}
