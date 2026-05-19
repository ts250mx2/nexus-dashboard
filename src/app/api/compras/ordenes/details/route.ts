import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const idOrdenCompra = searchParams.get('idOrdenCompra');
        const iteracion = searchParams.get('iteracion');

        if (!idOrdenCompra) {
            return NextResponse.json(
                { error: 'Missing required parameter: idOrdenCompra is required' },
                { status: 400 }
            );
        }

        const sql = `
            SELECT 
                B.IdOrdenCompra,
                B.IdArticulo,
                B.Cantidad,
                B.Costo,
                B.IVA,
                B.Rec,
                B.Iteracion,
                COALESCE(F.Codigo, 'S/C') AS CodigoBarras,
                COALESCE(F.Descripcion, 'Artículo sin descripción') AS Descripcion,
                (B.Cantidad * B.Costo) AS Total
            FROM tblDetalleOrdenesCompra B
            INNER JOIN tblArticulos F ON B.IdArticulo = F.IdArticulo
            WHERE B.IdOrdenCompra = ? AND B.Iteracion = ?
            ORDER BY B.IdRenglon ASC
        `;

        const results = await query(sql, [Number(idOrdenCompra), Number(iteracion || 0)]);
        return NextResponse.json(results);

    } catch (error: any) {
        console.error('Error fetching purchase order details:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
