import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const idTraspaso = searchParams.get('idTraspaso');

        if (!idTraspaso) {
            return NextResponse.json(
                { error: 'Missing required parameter: idTraspaso' },
                { status: 400 }
            );
        }

        const sql = `
            SELECT
                DT.IdTraspaso,
                DT.IdArticulo,
                DT.Cantidad,
                DT.Costo,
                COALESCE(A.Codigo, 'S/C') AS CodigoBarras,
                COALESCE(A.Descripcion, 'Artículo sin descripción') AS Descripcion,
                (DT.Cantidad * DT.Costo) AS Total
            FROM tblDetalleTraspasos DT
            INNER JOIN tblArticulos A ON DT.IdArticulo = A.IdArticulo
            WHERE DT.IdTraspaso = ?
            ORDER BY DT.IdArticulo ASC
        `;

        const results = await query(sql, [Number(idTraspaso)]);
        return NextResponse.json(results);

    } catch (error: any) {
        console.error('Error fetching traspaso details:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
