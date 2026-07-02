import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Comparativo de ventas de profesores por año.
 *
 * Para cada profesor (agrupado por socio + sucursal donde vendió) devuelve, por
 * cada año solicitado, tres métricas: Cantidad de ventas, Total facturado y
 * (derivado en el frontend) Ticket promedio.
 *
 * Parámetros:
 *  - years: lista de años separados por coma, p.ej. "2026,2025". (obligatorio)
 *  - mode:  'ytd'  → compara solo hasta la fecha actual (mismo día/mes) de cada año.
 *           'full' → compara el año completo. (default: 'full')
 *  - sucursalId: 'all' | "1,2" para filtrar por sucursal (opcional).
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const yearsParam = searchParams.get('years');
        const mode = searchParams.get('mode') === 'ytd' ? 'ytd' : 'full';
        const sucursalId = searchParams.get('sucursalId');

        if (!yearsParam) {
            return NextResponse.json({ error: 'Missing years parameter' }, { status: 400 });
        }

        // Parseo y validación estricta de años (enteros) para evitar inyección
        // en los alias/condiciones que se interpolan directamente.
        const years = Array.from(new Set(
            yearsParam
                .split(',')
                .map(y => parseInt(y.trim(), 10))
                .filter(y => Number.isInteger(y) && y >= 2000 && y <= 2100)
        )).sort((a, b) => b - a);

        if (years.length === 0) {
            return NextResponse.json({ error: 'No valid years provided' }, { status: 400 });
        }

        const minYear = Math.min(...years);
        const maxYear = Math.max(...years);
        const isYtd = mode === 'ytd';

        // Corte MM-DD de hoy para el modo "hasta la fecha actual"
        const now = new Date();
        const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const params: any[] = [];
        const metricSelects: string[] = [];

        for (const y of years) {
            if (isYtd) {
                metricSelects.push(`SUM(CASE WHEN YEAR(V.FechaVenta) = ? AND DATE_FORMAT(V.FechaVenta, '%m-%d') <= ? THEN 1 ELSE 0 END) AS Cantidad_${y}`);
                params.push(y, mmdd);
                metricSelects.push(`SUM(CASE WHEN YEAR(V.FechaVenta) = ? AND DATE_FORMAT(V.FechaVenta, '%m-%d') <= ? THEN V.Total ELSE 0 END) AS Total_${y}`);
                params.push(y, mmdd);
            } else {
                metricSelects.push(`SUM(CASE WHEN YEAR(V.FechaVenta) = ? THEN 1 ELSE 0 END) AS Cantidad_${y}`);
                params.push(y);
                metricSelects.push(`SUM(CASE WHEN YEAR(V.FechaVenta) = ? THEN V.Total ELSE 0 END) AS Total_${y}`);
                params.push(y);
            }
        }

        let sql = `
            SELECT
                S.IdSocio,
                S.Socio,
                S.Telefonos AS Telefono,
                S.Direccion,
                S.CorreoElectronico AS Correo,
                S.Contacto AS Disciplina,
                SUC.IdSucursal,
                SUC.Sucursal,
                ${metricSelects.join(',\n                ')}
            FROM tblVentas V
            INNER JOIN tblSocios S ON V.IdSocio = S.IdSocio
            INNER JOIN tblSucursales SUC ON V.IdSucursal = SUC.IdSucursal
            WHERE V.Status = 0
              AND V.FechaVenta >= ? AND V.FechaVenta < ?
        `;
        params.push(`${minYear}-01-01 00:00:00`, `${maxYear + 1}-01-01 00:00:00`);

        if (sucursalId && sucursalId !== 'all' && sucursalId !== '') {
            const ids = sucursalId.split(',').filter(id => id.trim() !== '');
            if (ids.length > 0) {
                const placeholders = ids.map(() => '?').join(',');
                sql += ` AND V.IdSucursal IN (${placeholders})`;
                params.push(...ids);
            }
        }

        // Solo filas con al menos una venta dentro de los años/rango comparados
        // (importante en modo YTD para descartar quienes solo vendieron después del corte).
        const havingExpr = years.map(y => `Cantidad_${y}`).join(' + ');

        sql += `
            GROUP BY S.IdSocio, S.Socio, S.Telefonos, S.Direccion, S.CorreoElectronico, S.Contacto, SUC.IdSucursal, SUC.Sucursal
            HAVING (${havingExpr}) > 0
            ORDER BY Total_${maxYear} DESC
        `;

        const rows = await query(sql, params);
        return NextResponse.json({ success: true, data: rows, years, mode });
    } catch (error: any) {
        console.error('Error in API /reportes/comparativo-profesores:', error);
        return NextResponse.json({ error: 'Database error fetching comparativo' }, { status: 500 });
    }
}
