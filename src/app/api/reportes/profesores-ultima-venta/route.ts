import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Profesores cuya ÚLTIMA venta (la más reciente a nivel global) es anterior a la
 * fecha de corte indicada. Devuelve también los datos de esa última venta
 * (folio, fecha, total, sucursal) para poder abrir su detalle directamente.
 *
 * Si se indica `sucursalId`, se filtra por la sucursal donde ocurrió la última
 * venta del profesor.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const cutoffDate = searchParams.get('cutoffDate');
        const sucursalId = searchParams.get('sucursalId');

        if (!cutoffDate) {
            return NextResponse.json({ error: 'Missing cutoffDate parameter' }, { status: 400 });
        }

        let sql = `
            SELECT
                LS.IdSocio,
                S.Socio AS Cliente,
                S.Contacto AS Disciplina,
                S.Telefonos AS Telefono,
                S.Direccion,
                LS.IdVenta,
                LS.IdSucursal,
                SUC.Sucursal,
                LS.FolioVenta AS Folio,
                DATE_FORMAT(LS.FechaVenta, '%Y-%m-%d %H:%i') AS UltimaVenta,
                LS.FechaVenta AS UltimaVentaRaw,
                LS.Total,
                DATEDIFF(CURDATE(), LS.FechaVenta) AS DiasSinComprar
            FROM tblVentas LS
            INNER JOIN (
                SELECT IdSocio, MAX(FechaVenta) AS MaxFecha
                FROM tblVentas
                WHERE Status = 0
                GROUP BY IdSocio
                HAVING MAX(FechaVenta) < ?
            ) M ON M.IdSocio = LS.IdSocio AND M.MaxFecha = LS.FechaVenta
            INNER JOIN tblSocios S ON S.IdSocio = LS.IdSocio
            INNER JOIN tblSucursales SUC ON SUC.IdSucursal = LS.IdSucursal
            WHERE LS.Status = 0
        `;

        const params: any[] = [cutoffDate + ' 00:00:00'];

        if (sucursalId !== null && sucursalId !== 'all') {
            if (sucursalId === '') {
                return NextResponse.json({ success: true, data: [] });
            }
            const ids = sucursalId.split(',').filter(id => id.trim() !== '');
            if (ids.length > 0) {
                const placeholders = ids.map(() => '?').join(',');
                sql += ` AND LS.IdSucursal IN (${placeholders})`;
                params.push(...ids);
            } else {
                return NextResponse.json({ success: true, data: [] });
            }
        }

        sql += ` ORDER BY LS.FechaVenta DESC`;

        const rows = await query(sql, params);

        // Defensa ante el caso raro de dos ventas válidas del mismo socio con la
        // misma FechaVenta exacta: nos quedamos con un único registro por socio.
        const seen = new Set<number>();
        const data = (rows as any[]).filter((r) => {
            if (seen.has(r.IdSocio)) return false;
            seen.add(r.IdSocio);
            return true;
        });

        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error('Error in API /reportes/profesores-ultima-venta:', error);
        return NextResponse.json({ error: 'Database error fetching report' }, { status: 500 });
    }
}
