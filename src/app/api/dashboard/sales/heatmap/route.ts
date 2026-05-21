import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const fechaInicio = searchParams.get('fechaInicio');
        const fechaFin = searchParams.get('fechaFin');
        const idTienda = searchParams.get('idTienda');

        if (!fechaInicio || !fechaFin) {
            return NextResponse.json({ error: 'Missing date parameters' }, { status: 400 });
        }

        let storeFilter = '';
        const params: any[] = [fechaInicio, fechaFin];
        
        if (idTienda && idTienda !== 'all') {
            storeFilter = ' AND v.IdSucursal = ?';
            params.push(parseInt(idTienda));
        }

        // MySQL query:
        // DAYOFWEEK(v.FechaVenta) -> returns 1 for Sunday, 2 for Monday, ..., 7 for Saturday.
        // HOUR(v.FechaVenta) -> returns hour (0-23).
        const sql = `
            SELECT 
                DAYOFWEEK(v.FechaVenta) as DiaSemana,
                HOUR(v.FechaVenta) as Hora,
                SUM(v.Total) as TotalVentas,
                COUNT(*) as CantidadTickets
            FROM tblVentas v
            WHERE v.Status = 0 AND DATE(v.FechaVenta) >= ? AND DATE(v.FechaVenta) <= ?
            ${storeFilter}
            GROUP BY DAYOFWEEK(v.FechaVenta), HOUR(v.FechaVenta)
            ORDER BY DiaSemana, Hora
        `;

        const results = await query(sql, params);

        // Fetch stores list for the sidebar filter that had active sales in the selected period.
        const storesSql = `
            SELECT DISTINCT s.IdSucursal, s.Sucursal as Tienda 
            FROM tblVentas v
            JOIN tblSucursales s ON v.IdSucursal = s.IdSucursal
            WHERE v.Status = 0 AND DATE(v.FechaVenta) >= ? AND DATE(v.FechaVenta) <= ?
            ORDER BY s.Sucursal
        `;
        const stores = await query(storesSql, [fechaInicio, fechaFin]);

        return NextResponse.json({ 
            success: true,
            data: results,
            stores: stores
        });

    } catch (error: any) {
        console.error('Error fetching heatmap data:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
