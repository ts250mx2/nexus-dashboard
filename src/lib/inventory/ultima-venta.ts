import { query } from '@/lib/db';

/**
 * Última venta de cada artículo en cada sucursal.
 *
 * Va en una consulta aparte, no dentro del reporte de inventario: agregar los
 * 2 millones de renglones de tblDetalleVentas cuesta ~3.5s, mientras que
 * acotarlo a los artículos que de verdad se van a mostrar baja a menos de 1s.
 * Por eso recibe las filas ya calculadas y solo las completa.
 *
 * Se topa con NOW() porque la base tiene tickets con fecha futura (hay uno de
 * 2029): sin el tope, ese artículo diría que se vendió dentro de tres años.
 */

/** Clave del mapa; artículo y sucursal juntos, que es como se identifica una existencia. */
export function claveArticuloSucursal(idArticulo: unknown, idSucursal: unknown): string {
    return `${Number(idArticulo)}-${Number(idSucursal)}`;
}

/** Enteros válidos y sin repetir, listos para interpolar en un IN. */
function idsValidos(valores: unknown[]): number[] {
    const limpios = valores
        .map(v => Number(v))
        .filter(n => Number.isInteger(n) && n > 0);
    return Array.from(new Set(limpios));
}

export interface FilaConArticulo {
    IdArticulo: number;
    IdSucursal: number;
}

/**
 * Mapa `idArticulo-idSucursal` → fecha de la última venta. Los artículos que
 * nunca se han vendido simplemente no aparecen.
 */
export async function ultimaVentaPorArticulo(filas: FilaConArticulo[]): Promise<Map<string, string>> {
    const articulos = idsValidos(filas.map(f => f.IdArticulo));
    const sucursales = idsValidos(filas.map(f => f.IdSucursal));
    if (articulos.length === 0 || sucursales.length === 0) return new Map();

    const sql = `
        SELECT DV.IdArticulo, DV.IdSucursal, MAX(V.FechaVenta) AS UltimaVenta
        FROM tblDetalleVentas DV
        INNER JOIN tblVentas V
                ON V.IdVenta    = DV.IdVenta
               AND V.IdSucursal = DV.IdSucursal
        WHERE V.Status = 0
          AND V.FechaVenta <= NOW()
          AND DV.IdArticulo IN (${articulos.join(',')})
          AND DV.IdSucursal IN (${sucursales.join(',')})
        GROUP BY DV.IdArticulo, DV.IdSucursal
    `;

    const filasVenta = (await query(sql)) as { IdArticulo: number; IdSucursal: number; UltimaVenta: string }[];
    return new Map(
        filasVenta.map(f => [claveArticuloSucursal(f.IdArticulo, f.IdSucursal), f.UltimaVenta])
    );
}

/** Agrega `UltimaVenta` a cada fila, con null para lo que nunca se ha vendido. */
export async function conUltimaVenta<T extends FilaConArticulo>(
    filas: T[]
): Promise<(T & { UltimaVenta: string | null })[]> {
    const mapa = await ultimaVentaPorArticulo(filas);
    return filas.map(fila => ({
        ...fila,
        UltimaVenta: mapa.get(claveArticuloSucursal(fila.IdArticulo, fila.IdSucursal)) ?? null,
    }));
}
