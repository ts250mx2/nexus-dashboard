import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const sucursalId = searchParams.get('sucursalId'); // "all", comma-separated, or empty

        if (!startDate || !endDate) {
            return NextResponse.json({ error: 'Missing date parameters' }, { status: 400 });
        }

        let sql = `
            SELECT 
                S.IdSocio,
                S.Socio as Cliente,
                COUNT(V.IdVenta) as TotalVentas,
                SUM(V.Total) as ImporteTotal,
                SUM(V.Total) / COUNT(V.IdVenta) as TicketPromedio
            FROM tblVentas V
            INNER JOIN tblSocios S ON V.IdSocio = S.IdSocio
            WHERE V.FechaVenta BETWEEN ? AND ?
        `;

        const params: any[] = [startDate + ' 00:00:00', endDate + ' 23:59:59'];

        // Logic for sucursalId:
        // null/undefined/all -> Show all
        // "" (empty string) -> Show NOTHING (no branches selected)
        // "1,2,3" -> Show specific branches
        if (sucursalId !== null && sucursalId !== 'all') {
            if (sucursalId === '') {
                // Return empty results immediately if no branches selected
                return NextResponse.json({ success: true, data: [] });
            }
            const ids = sucursalId.split(',').filter(id => id.trim() !== '');
            if (ids.length > 0) {
                const placeholders = ids.map(() => '?').join(',');
                sql += ` AND V.IdSucursal IN (${placeholders})`;
                params.push(...ids);
            } else {
                return NextResponse.json({ success: true, data: [] });
            }
        }

        sql += ` GROUP BY S.IdSocio, S.Socio ORDER BY ImporteTotal DESC`;

        const rows = await query(sql, params);
        return NextResponse.json({ success: true, data: rows });
    } catch (error: any) {
        console.error('Error in API /reportes/profesores:', error);
        return NextResponse.json({ error: 'Database error fetching report' }, { status: 500 });
    }
}
