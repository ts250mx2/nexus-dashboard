/**
 * Constructor del bloque WITH común a los cuatro módulos de inventario.
 *
 * Devuelve el prefijo `WITH ... base AS (...)` para que cada endpoint solo
 * agregue sus propios CTE de clasificación y su SELECT final. Así los cuatro
 * reportes comparten exactamente la misma definición de existencia, demanda,
 * mínimo y cobertura, y no pueden desviarse entre sí.
 */

import {
    SUCURSAL_EXCLUSION,
    cteDemanda,
    cteExistencia,
    cteParametros,
    cteTransito,
    exprCobertura,
    exprMinimo,
} from './source';
import { searchClause, sucursalClause } from './params';

export interface BaseQueryOptions {
    dias: number;
    sucursales: number[];
    search: string;
    /**
     * Incluye el CTE de mercancía en tránsito y la columna EnTransito.
     * Cuesta ~2s extra, así que solo lo pide la sugerencia de pedidos.
     */
    conTransito?: boolean;
}

export interface BaseQuery {
    /** Prefijo `WITH ...` que termina en el CTE `base`. */
    sql: string;
    /** Parámetros posicionales que corresponden al prefijo. */
    params: string[];
}

/**
 * Columnas expuestas por el CTE `base`:
 *   IdArticulo, IdSucursal, Sucursal, Producto, Descripcion, Codigo, Depto,
 *   Marca, IdProveedor, Exi, CostoUnitario, ValorInventario, Fuente,
 *   DemandaDiaria, UnidadesPeriodo, UnidadesVenta, VentaPeriodo, PrecioPromedio,
 *   UltimaVenta, UltimaSalida, ExiMinRes, DiasSurtido, DiasMax, Minimo,
 *   Cobertura, EnTransito
 */
export function buildBaseQuery(opts: BaseQueryOptions): BaseQuery {
    const { dias, sucursales, search, conTransito = false } = opts;

    const sucFilter = sucursalClause(sucursales, 'E');
    const { sql: searchSql, params: searchParams } = searchClause(search, 'A');

    const transitoCte = conTransito ? `,${cteTransito(sucursales)}` : '';
    const transitoJoin = conTransito
        ? 'LEFT JOIN transito T ON T.IdArticulo = E.IdArticulo AND T.IdSucursal = E.IdSucursal'
        : '';
    const transitoCol = conTransito ? 'IFNULL(T.EnTransito, 0)' : '0';

    const sql = `
WITH
${cteExistencia(sucursales)},
${cteDemanda(dias, sucursales)},
${cteParametros(sucursales)}${transitoCte},
base AS (
    SELECT
        E.IdArticulo,
        E.IdSucursal,
        S.Sucursal,
        COALESCE(A.Producto, 'Artículo sin nombre')          AS Producto,
        COALESCE(A.Descripcion, '')                          AS Descripcion,
        COALESCE(A.Codigo, A.CodigoBarras, 'S/C')            AS Codigo,
        COALESCE(NULLIF(A.Depto, ''), 'Sin Depto')           AS Depto,
        COALESCE(NULLIF(A.Marca, ''), 'Sin Marca')           AS Marca,
        IFNULL(A.IdProveedor, 0)                             AS IdProveedor,
        E.Exi,
        E.CostoUnitario,
        (E.Exi * E.CostoUnitario)                            AS ValorInventario,
        E.Fuente,
        IFNULL(D.DemandaDiaria, 0)                           AS DemandaDiaria,
        IFNULL(D.UnidadesPeriodo, 0)                         AS UnidadesPeriodo,
        IFNULL(D.UnidadesVenta, 0)                           AS UnidadesVenta,
        IFNULL(D.VentaPeriodo, 0)                            AS VentaPeriodo,
        IFNULL(D.PrecioPromedio, 0)                          AS PrecioPromedio,
        D.UltimaVenta,
        D.UltimaSalida,
        IFNULL(P.ExiMinRes, 0)                               AS ExiMinRes,
        IFNULL(P.DiasSurtido, 0)                             AS DiasSurtido,
        IFNULL(P.DiasMax, 0)                                 AS DiasMax,
        ${exprMinimo('P', 'D')}                              AS Minimo,
        ${exprCobertura('E', 'D')}                           AS Cobertura,
        ${transitoCol}                                       AS EnTransito
    FROM existencia E
    INNER JOIN tblSucursales S ON S.IdSucursal = E.IdSucursal
    INNER JOIN tblArticulos  A ON A.IdArticulo = E.IdArticulo
    LEFT JOIN demanda    D ON D.IdArticulo = E.IdArticulo AND D.IdSucursal = E.IdSucursal
    LEFT JOIN parametros P ON P.IdArticulo = E.IdArticulo AND P.IdSucursal = E.IdSucursal
    ${transitoJoin}
    WHERE ${SUCURSAL_EXCLUSION}
      AND IFNULL(A.Status, 0) = 0${sucFilter}${searchSql}
)`;

    return { sql, params: searchParams };
}
