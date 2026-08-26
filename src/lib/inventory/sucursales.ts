import { query } from '@/lib/db';

/**
 * Catálogo de sucursales que participan en los reportes de inventario.
 * Aplica la misma exclusión (fiscal / prueba) que el resto del módulo para que
 * ningún consumidor ofrezca sucursales que después no devuelven datos.
 */

export interface SucursalInventario {
    IdSucursal: number;
    Sucursal: string;
}

export async function listarSucursalesInventario(): Promise<SucursalInventario[]> {
    const sql = `
        SELECT S.IdSucursal, S.Sucursal
        FROM tblSucursales S
        WHERE LOWER(S.Sucursal) NOT LIKE '%fiscal%'
          AND LOWER(S.Sucursal) NOT LIKE '%prueba%'
          AND IFNULL(S.Status, 0) = 0
        ORDER BY S.Sucursal
    `;
    const rows = (await query(sql)) as { IdSucursal: unknown; Sucursal: unknown }[];
    return rows
        .map(r => ({ IdSucursal: Number(r.IdSucursal), Sucursal: String(r.Sucursal ?? '') }))
        .filter(s => Number.isInteger(s.IdSucursal) && s.IdSucursal > 0);
}
