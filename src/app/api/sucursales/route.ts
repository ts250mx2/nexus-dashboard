import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
    try {
        const rows = await query('SELECT IdSucursal as id, Sucursal as name FROM tblSucursales ORDER BY Sucursal ASC');
        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error in API /sucursales:', error);
        return NextResponse.json({ error: 'Database error fetching sucursales' }, { status: 500 });
    }
}
