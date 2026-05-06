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
                V.IdVenta,
                V.IdSucursal,
                V.FolioVenta as Folio,
                DATE_FORMAT(V.FechaVenta, '%Y-%m-%d %H:%i') as Fecha,
                S.Sucursal,
                V.Total
            FROM tblVentas V
            INNER JOIN tblSucursales S ON V.IdSucursal = S.IdSucursal
            WHERE V.IdSocio = ?
            AND V.FechaVenta BETWEEN ? AND ?
        `;

        const params: any[] = [idSocio, startDate + ' 00:00:00', endDate + ' 23:59:59'];

        if (sucursalId !== null && sucursalId !== 'all') {
            if (sucursalId === '') {
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

        sql += ` ORDER BY V.FechaVenta DESC`;

        const rows = await query(sql, params);
        return NextResponse.json({ success: true, data: rows });
    } catch (error: any) {
        console.error('Error in API /reportes/profesores/detalle:', error);
        return NextResponse.json({ error: 'Database error fetching details' }, { status: 500 });
    }
}
