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
                S.IdSucursal,
                S.Sucursal as Nombre,
                COUNT(DISTINCT V.IdSocio) as TotalClientes,
                SUM(V.Total) as TotalVenta,
                SUM(V.Total) / COUNT(V.IdVenta) as TicketPromedio
            FROM tblSucursales S
            INNER JOIN tblVentas V ON S.IdSucursal = V.IdSucursal
            WHERE V.FechaVenta BETWEEN ? AND ?
        `;

        const params: any[] = [startDate + ' 00:00:00', endDate + ' 23:59:59'];

        if (sucursalId && sucursalId !== 'all' && sucursalId !== '') {
            const ids = sucursalId.split(',').filter(id => id.trim() !== '');
            if (ids.length > 0) {
                const placeholders = ids.map(() => '?').join(',');
                sql += ` AND S.IdSucursal IN (${placeholders})`;
                params.push(...ids);
            }
        }

        sql += ` GROUP BY S.IdSucursal, S.Sucursal ORDER BY TotalVenta DESC`;

        const rows = await query(sql, params);
        return NextResponse.json({ success: true, data: rows });
    } catch (error: any) {
        console.error('Error in API /reportes/profesores/sucursales:', error);
        return NextResponse.json({ error: 'Database error fetching branch summary' }, { status: 500 });
    }
}
