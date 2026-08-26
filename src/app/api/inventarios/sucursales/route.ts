import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { listarSucursalesInventario } from '@/lib/inventory/sucursales';

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
        const data: SucursalOption[] = await listarSucursalesInventario();
        return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
        console.error('Error al obtener el catálogo de sucursales:', error);
        return NextResponse.json(
            { success: false, error: getErrorMessage(error, 'Error al obtener las sucursales') },
            { status: 500 }
        );
    }
}
