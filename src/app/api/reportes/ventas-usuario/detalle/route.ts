import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Detalle de ventas de un usuario (cajero) en el periodo: folio, fecha,
 * sucursal, cliente y total, para abrir el desglose del ticket.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const idUsuario = searchParams.get('idUsuario');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const sucursalId = searchParams.get('sucursalId');

        if (!idUsuario || !startDate || !endDate) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        let sql = `
            SELECT
                V.IdVenta,
                V.IdSucursal,
                V.FolioVenta as Folio,
                DATE_FORMAT(V.FechaVenta, '%Y-%m-%d %H:%i') as Fecha,
                S.Sucursal,
                SO.Socio as Cliente,
                V.Total
            FROM tblVentas V
            INNER JOIN tblSucursales S ON V.IdSucursal = S.IdSucursal
            LEFT JOIN tblSocios SO ON V.IdSocio = SO.IdSocio
            WHERE V.IdUsuarioVenta = ?
              AND V.Status = 0
              AND V.FechaVenta BETWEEN ? AND ?
        `;

        const params: any[] = [idUsuario, startDate + ' 00:00:00', endDate + ' 23:59:59'];

        if (sucursalId && sucursalId !== 'all' && sucursalId !== '') {
            const ids = sucursalId.split(',').filter(id => id.trim() !== '');
            if (ids.length > 0) {
                const placeholders = ids.map(() => '?').join(',');
                sql += ` AND V.IdSucursal IN (${placeholders})`;
                params.push(...ids);
            }
        }

        sql += ` ORDER BY V.FechaVenta DESC`;

        const rows = await query(sql, params);
        return NextResponse.json({ success: true, data: rows });
    } catch (error: any) {
        console.error('Error in API /reportes/ventas-usuario/detalle:', error);
        return NextResponse.json({ error: 'Database error fetching user sales detail' }, { status: 500 });
    }
}
