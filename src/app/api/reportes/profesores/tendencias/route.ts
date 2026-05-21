import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const idSocio = searchParams.get('idSocio');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const sucursalId = searchParams.get('sucursalId');
        const groupBy = searchParams.get('groupBy') || 'dia';

        if (!idSocio || !startDate || !endDate) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        let dateSelector = 'DATE(V.FechaVenta)';
        if (groupBy === 'semana') {
            dateSelector = 'DATE_SUB(DATE(V.FechaVenta), INTERVAL WEEKDAY(V.FechaVenta) DAY)';
        } else if (groupBy === 'mes') {
            dateSelector = 'DATE_FORMAT(V.FechaVenta, "%Y-%m-01")';
        }

        let sql = `
            SELECT 
                ${dateSelector} as Fecha,
                SUM(DV.Cantidad) as Cantidad,
                SUM(DV.PrecioVenta * DV.Cantidad) as Total,
                COUNT(DISTINCT V.IdVenta) as NumeroTickets
            FROM tblDetalleVentas DV
            INNER JOIN tblVentas V ON DV.IdVenta = V.IdVenta AND DV.IdSucursal = V.IdSucursal
            WHERE V.Status = 0
              AND V.IdSocio = ?
              AND V.FechaVenta BETWEEN ? AND ?
        `;

        const params: any[] = [
            idSocio,
            startDate + ' 00:00:00',
            endDate + ' 23:59:59'
        ];

        if (sucursalId && sucursalId !== 'all' && sucursalId !== '') {
            sql += ` AND V.IdSucursal = ?`;
            params.push(sucursalId);
        }

        sql += ` GROUP BY ${dateSelector} ORDER BY Fecha ASC`;

        const rows = await query(sql, params);
        return NextResponse.json({ success: true, data: rows });
    } catch (error: any) {
        console.error('Error in API /reportes/profesores/tendencias:', error);
        return NextResponse.json({ error: 'Database error fetching professor trends' }, { status: 500 });
    }
}
