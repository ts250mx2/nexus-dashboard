import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getErrorMessage } from '@/lib/errors';

/**
 * Catálogo de sucursales que participan en los reportes de inventario.
 * Aplica la misma exclusión (fiscal / prueba) que el resto del módulo para que
 * el filtro de la UI no ofrezca sucursales que después no devuelven datos.
 */

interface SucursalOption {
    IdSucursal: number;
    Sucursal: string;
}

export async function GET() {
    try {
        const sql = `
            SELECT S.IdSucursal, S.Sucursal
            FROM tblSucursales S
            WHERE LOWER(S.Sucursal) NOT LIKE '%fiscal%'
              AND LOWER(S.Sucursal) NOT LIKE '%prueba%'
              AND IFNULL(S.Status, 0) = 0
            ORDER BY S.Sucursal
        `;

        const data = (await query(sql)) as SucursalOption[];
        return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
        console.error('Error al obtener el catálogo de sucursales:', error);
        return NextResponse.json(
            { success: false, error: getErrorMessage(error, 'Error al obtener las sucursales') },
            { status: 500 }
        );
    }
}
