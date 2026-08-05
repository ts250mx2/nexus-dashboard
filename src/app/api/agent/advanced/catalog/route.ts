import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

let cache: { stores: Array<{ id: number; name: string }>; departments: string[] } | null = null;

/**
 * GET /api/agent/advanced/catalog
 * Valores reales para los filtros del visor (sucursales y departamentos).
 * Cacheado en memoria. Producto/proveedor/cliente usan filtro de texto libre.
 */
export async function GET() {
    if (cache) return NextResponse.json(cache);
    try {
        const [storeRows, deptRows] = await Promise.all([
            query(`SELECT IdSucursal, Sucursal FROM tblSucursales ORDER BY Sucursal`) as Promise<Array<{ IdSucursal: number; Sucursal: string }>>,
            query(
                `SELECT DISTINCT Depto FROM tblArticulos
                 WHERE Depto IS NOT NULL AND Depto <> '' AND Status = 0
                 ORDER BY Depto`
            ).catch(() => []) as Promise<Array<{ Depto: string }>>,
        ]);
        cache = {
            stores: storeRows.map((r) => ({ id: r.IdSucursal, name: r.Sucursal })),
            departments: (deptRows as Array<{ Depto: string }>).map((r) => r.Depto).filter(Boolean),
        };
        return NextResponse.json(cache);
    } catch (e: any) {
        return NextResponse.json({ stores: [], departments: [], error: e?.message || 'Error cargando catálogo' }, { status: 200 });
    }
}
