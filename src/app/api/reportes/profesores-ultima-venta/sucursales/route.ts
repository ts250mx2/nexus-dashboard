import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Resumen por sucursal de "Profesores Última Venta".
 *
 * Lista, agrupado por sucursal, cuántos profesores tienen su ÚLTIMA venta
 * (la más reciente a nivel global, considerando todas las sucursales) anterior
 * a la fecha de corte indicada. Cada profesor se atribuye a la sucursal donde
 * ocurrió esa última venta, de modo que la suma de las tarjetas coincide con el
 * total global.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const cutoffDate = searchParams.get('cutoffDate');

        if (!cutoffDate) {
            return NextResponse.json({ error: 'Missing cutoffDate parameter' }, { status: 400 });
        }

        const sql = `
            SELECT
                SUC.IdSucursal,
                SUC.Sucursal AS Nombre,
                COUNT(DISTINCT LS.IdSocio) AS TotalProfesores,
                SUM(LS.Total) AS TotalUltimasVentas,
                MIN(LS.FechaVenta) AS VentaMasAntigua,
                MAX(LS.FechaVenta) AS VentaMasReciente
            FROM tblVentas LS
            INNER JOIN (
                SELECT IdSocio, MAX(FechaVenta) AS MaxFecha
                FROM tblVentas
                WHERE Status = 0
                GROUP BY IdSocio
                HAVING MAX(FechaVenta) < ?
            ) M ON M.IdSocio = LS.IdSocio AND M.MaxFecha = LS.FechaVenta
            INNER JOIN tblSucursales SUC ON SUC.IdSucursal = LS.IdSucursal
            WHERE LS.Status = 0
            GROUP BY SUC.IdSucursal, SUC.Sucursal
            ORDER BY TotalProfesores DESC
        `;

        const params: any[] = [cutoffDate + ' 00:00:00'];

        const rows = await query(sql, params);
        return NextResponse.json({ success: true, data: rows });
    } catch (error: any) {
        console.error('Error in API /reportes/profesores-ultima-venta/sucursales:', error);
        return NextResponse.json({ error: 'Database error fetching branch summary' }, { status: 500 });
    }
}
