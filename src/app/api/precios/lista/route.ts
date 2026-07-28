import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Lista de precios vigente por zona.
 *
 * Devuelve, para cada artículo activo con precio en la zona solicitada,
 * el costo base y los cuatro niveles de precio junto con la fecha del
 * último cambio de precio.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const rawZonaId = searchParams.get('zonaId');

        if (!rawZonaId) {
            return NextResponse.json({ error: 'Missing zonaId parameter' }, { status: 400 });
        }

        const zonaId = Number(rawZonaId);
        if (!Number.isInteger(zonaId) || zonaId <= 0) {
            return NextResponse.json({ error: 'Invalid zonaId parameter' }, { status: 400 });
        }

        const sql = `
            SELECT
                A.Codigo,
                A.Descripcion,
                A.PrecioBase AS Costo,
                B.Precio1 AS PrecioPublico,
                B.Precio2 AS PrecioProfesor,
                B.Precio3 AS PrecioDistribuidor,
                B.Precio4 AS DistribuidoEspecial,
                B.FechaAct AS FechaCambioPrecio
            FROM tblArticulos A
            INNER JOIN tblListaPrecios B ON A.IdArticulo = B.IdArticulo
            WHERE B.IdZona = ? AND A.Status = 0
            ORDER BY A.Descripcion
        `;

        const rows = await query(sql, [zonaId]);
        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error in API /precios/lista:', error);
        return NextResponse.json({ error: 'Database error fetching lista de precios' }, { status: 500 });
    }
}
