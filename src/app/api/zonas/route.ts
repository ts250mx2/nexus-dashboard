import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Catálogo de zonas activas (tblZonas.Status = 0).
 * Usado por la Lista de Precios para elegir la zona a consultar.
 */
export async function GET() {
    try {
        const rows = await query('SELECT IdZona as id, Zona as name FROM tblZonas WHERE Status = 0 ORDER BY Zona ASC');
        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error in API /zonas:', error);
        return NextResponse.json({ error: 'Database error fetching zonas' }, { status: 500 });
    }
}
