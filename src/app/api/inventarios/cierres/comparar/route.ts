import { NextRequest, NextResponse } from 'next/server';
import { compararConHoy } from '@/lib/inventory/cierres';
import { autorizadoCierres } from '@/lib/inventory/cierres-auth';
import { parseSucursales } from '@/lib/inventory/params';

/**
 * COMPARACIÓN DE CIERRES
 *
 * GET ?sucursal=N → los cierres guardados de la sucursal en fila con el
 * inventario de hoy calculado en vivo, con la verificación de cada transición
 * (corte del ERP vs cierre anterior) artículo por artículo.
 * Exige sesión del portal o el encabezado `x-cierre-token`.
 */

export const maxDuration = 120;

export async function GET(req: NextRequest) {
    if (!(await autorizadoCierres(req))) {
        return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }
    try {
        const raw = (new URL(req.url).searchParams.get('sucursal') || '').trim();
        const ids = parseSucursales(raw);

        if (raw && ids.length !== 1) {
            return NextResponse.json(
                { success: false, error: 'El parámetro "sucursal" debe ser un solo ID entero positivo' },
                { status: 400 }
            );
        }
        if (ids.length !== 1) {
            return NextResponse.json({ success: true, requiereSucursal: true, data: null });
        }

        const data = await compararConHoy(ids[0]);
        return NextResponse.json({ success: true, requiereSucursal: false, data });
    } catch (error: unknown) {
        console.error('Error al comparar cierres de inventario:', error);
        return NextResponse.json(
            { success: false, error: 'No se pudo comparar el inventario. Inténtalo de nuevo en unos segundos.' },
            { status: 500 }
        );
    }
}
