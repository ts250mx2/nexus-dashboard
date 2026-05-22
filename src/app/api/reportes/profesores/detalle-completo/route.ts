import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Devuelve TODAS las ventas de los profesores en un periodo, opcionalmente filtradas por sucursal.
 * Pensado para exportes "con detalle" que necesitan ver el profesor + sus ventas en un solo paso.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const sucursalId = searchParams.get('sucursalId') || 'all';

        if (!startDate || !endDate) {
            return NextResponse.json({ error: 'Missing parameters: startDate and endDate' }, { status: 400 });
        }

        let sql = `
            SELECT
                V.IdVenta,
                V.IdSucursal,
                V.IdSocio,
                SO.Socio AS Profesor,
                V.FolioVenta AS Folio,
                DATE_FORMAT(V.FechaVenta, '%Y-%m-%d %H:%i') AS Fecha,
                S.Sucursal,
                U.Usuario AS Cajero,
                V.Total
            FROM tblVentas V
            INNER JOIN tblSucursales S ON V.IdSucursal = S.IdSucursal
            INNER JOIN tblSocios SO ON V.IdSocio = SO.IdSocio
            LEFT JOIN tblUsuarios U ON V.IdUsuarioVenta = U.IdUsuario
            WHERE V.FechaVenta BETWEEN ? AND ?
              AND V.IdSocio > 0
        `;

        const params: any[] = [`${startDate} 00:00:00`, `${endDate} 23:59:59`];

        if (sucursalId !== 'all' && sucursalId !== '') {
            const ids = sucursalId.split(',').filter(id => id.trim() !== '');
            if (ids.length > 0) {
                const placeholders = ids.map(() => '?').join(',');
                sql += ` AND V.IdSucursal IN (${placeholders})`;
                params.push(...ids);
            }
        }

        sql += ` ORDER BY SO.Socio ASC, V.FechaVenta DESC`;

        const rows = await query(sql, params);
        return NextResponse.json({ success: true, data: rows });
    } catch (error: any) {
        console.error('Error in API /reportes/profesores/detalle-completo:', error);
        return NextResponse.json({ error: 'Database error fetching full details' }, { status: 500 });
    }
}
