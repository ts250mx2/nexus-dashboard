import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const idArticulo = searchParams.get('idArticulo');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const sucursalId = searchParams.get('sucursalId');

        if (!idArticulo || !startDate || !endDate) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        let sql = `
            SELECT
                V.IdVenta,
                V.IdSucursal,
                V.FolioVenta as Folio,
                DATE_FORMAT(V.FechaVenta, '%Y-%m-%d %H:%i') as Fecha,
                S.Sucursal,
                V.Total as TotalVenta,
                SUM(DV.Cantidad) as CantidadArticulo,
                SUM(DV.PrecioVenta * DV.Cantidad) as TotalArticulo
            FROM tblVentas V
            INNER JOIN tblDetalleVentas DV ON DV.IdVenta = V.IdVenta AND DV.IdSucursal = V.IdSucursal
            INNER JOIN tblArticulos A ON DV.IdArticulo = A.IdArticulo
            INNER JOIN tblSucursales S ON V.IdSucursal = S.IdSucursal
            WHERE A.IdArticulo = ?
              AND V.FechaVenta BETWEEN ? AND ?
              AND V.Status = 0
        `;

        const params: any[] = [idArticulo, `${startDate} 00:00:00`, `${endDate} 23:59:59`];

        if (sucursalId && sucursalId !== 'all' && sucursalId !== '') {
            sql += ` AND V.IdSucursal = ?`;
            params.push(sucursalId);
        }

        sql += ` GROUP BY V.IdVenta, V.IdSucursal, V.FolioVenta, V.FechaVenta, S.Sucursal, V.Total ORDER BY V.FechaVenta DESC`;

        const rows = await query(sql, params);
        return NextResponse.json({ success: true, data: rows });
    } catch (error: any) {
        console.error('Error in API /reportes/productos/ventas:', error);
        return NextResponse.json({ error: 'Database error fetching product sales detail' }, { status: 500 });
    }
}
