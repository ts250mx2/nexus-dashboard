import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
    try {
        const results = await query(`
            SELECT Pregunta, COUNT(*) as Frecuencia
            FROM tblLogPreguntas
            WHERE Error = 0
            GROUP BY Pregunta
            ORDER BY Frecuencia DESC
            LIMIT 5
        `);
        return NextResponse.json(results);
    } catch (error) {
        return NextResponse.json([]);
    }
}
