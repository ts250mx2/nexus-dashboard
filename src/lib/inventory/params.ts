/**
 * Validación de parámetros de los endpoints de inventario.
 *
 * Todo lo que se interpola directo en SQL (listas de IDs, intervalos de días,
 * límites) pasa por aquí y se valida como entero. Los textos libres siempre
 * viajan como placeholder `?`.
 */

import {
    DIAS_COBERTURA_DEFAULT,
    DIAS_DEMANDA_DEFAULT,
    DIAS_EXCESO_DEFAULT,
} from './source';

export interface InventoryFilters {
    /** IDs de sucursal ya validados como enteros. Vacío = todas. */
    sucursales: number[];
    /** Ventana de historia de venta para estimar la demanda. */
    dias: number;
    /** Cobertura objetivo en días. */
    diasCobertura: number;
    /** Umbral de días de cobertura a partir del cual hay exceso. */
    diasExceso: number;
    /** Texto libre de búsqueda (producto, código, marca). */
    search: string;
    /** Tope de filas de detalle. */
    limit: number;
}

const MAX_LIMIT = 1000;

function toInt(raw: string | null, fallback: number, min: number, max: number): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    const i = Math.trunc(n);
    if (i < min || i > max) return fallback;
    return i;
}

/** Convierte "1,2,3" en [1,2,3] descartando cualquier cosa que no sea entero positivo. */
export function parseSucursales(raw: string | null): number[] {
    if (!raw || raw === 'all') return [];
    return raw
        .split(',')
        .map(s => Number(s.trim()))
        .filter(n => Number.isInteger(n) && n > 0);
}

export function parseFilters(searchParams: URLSearchParams): InventoryFilters {
    return {
        sucursales: parseSucursales(searchParams.get('sucursales')),
        dias: toInt(searchParams.get('dias'), DIAS_DEMANDA_DEFAULT, 7, 730),
        diasCobertura: toInt(searchParams.get('diasCobertura'), DIAS_COBERTURA_DEFAULT, 1, 365),
        diasExceso: toInt(searchParams.get('diasExceso'), DIAS_EXCESO_DEFAULT, 1, 3650),
        search: (searchParams.get('search') || '').trim().slice(0, 80),
        limit: toInt(searchParams.get('limit'), 500, 1, MAX_LIMIT),
    };
}

/**
 * Fragmento WHERE para acotar sucursales. Los IDs ya vienen validados como
 * enteros por parseSucursales, por eso se pueden interpolar sin placeholder.
 */
export function sucursalClause(sucursales: number[], alias = 'E'): string {
    if (sucursales.length === 0) return '';
    return ` AND ${alias}.IdSucursal IN (${sucursales.join(',')})`;
}

/** Fragmento WHERE + params para la búsqueda de texto sobre el catálogo. */
export function searchClause(search: string, alias = 'A'): { sql: string; params: string[] } {
    if (!search) return { sql: '', params: [] };
    const like = `%${search}%`;
    return {
        sql: ` AND (${alias}.Producto LIKE ? OR ${alias}.Descripcion LIKE ? OR ${alias}.Codigo LIKE ? OR ${alias}.CodigoBarras LIKE ? OR ${alias}.Marca LIKE ?)`,
        params: [like, like, like, like, like],
    };
}
