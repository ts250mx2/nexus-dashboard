import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
    try {
        const [deptos, articulos] = await Promise.all([
            query('SELECT DISTINCT Depto FROM tblArticulos WHERE Depto IS NOT NULL AND Depto <> "" ORDER BY Depto'),
            query('SELECT IdArticulo, Codigo, CodigoBarras, Descripcion FROM tblArticulos WHERE Descripcion IS NOT NULL AND Descripcion <> "" ORDER BY Descripcion')
        ]);

        return NextResponse.json({
            success: true,
            deptos,
            articulos
        });
    } catch (error: any) {
        console.error('Error fetching trend filters:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
