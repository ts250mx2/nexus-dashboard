import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getErrorMessage } from '@/lib/errors';
import { buildBaseQuery } from '@/lib/inventory/base-query';
import { parseFilters } from '@/lib/inventory/params';

/**
 * INVENTARIO POR SUCURSAL
 *
 * Tablero de estado: una fila por sucursal con su inventario valorizado, la
 * composición del stock (con existencia / en cero / negativo) y cuántos SKUs
 * caen en cada zona de la banda (quiebre, bajo mínimo, exceso, sin rotación).
 *
 * A diferencia de los otros módulos, la agregación se hace en SQL porque el
 * resultado son 15 filas: no tiene caso traer 34 mil renglones al servidor.
 * El detalle por artículo se pide aparte con `detalle=1`.
 */

interface SucursalRow {
    IdSucursal: number;
    Sucursal: string;
    SkusTotales: number;
    SkusConExistencia: number;
    SkusEnCero: number;
    SkusNegativos: number;
    Unidades: number;
    Valorizado: number;
    ValorNegativo: number;
    Quiebres: number;
    BajoMinimo: number;
    Exceso: number;
    SinRotacion: number;
    CoberturaGlobal: number | null;
    CostoVenta: number;
    VentaPeriodo: number;
    DesdeMovimientos: number;
}

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const filters = parseFilters(url.searchParams);
        const conDetalle = url.searchParams.get('detalle') === '1';

        const { sql: baseSql, params } = buildBaseQuery({
            dias: filters.dias,
            sucursales: filters.sucursales,
            search: filters.search,
        });

        // Las banderas replican EXACTAMENTE la definición de cada módulo dedicado
        // para que los totales de este tablero cuadren con los de quiebres y
        // sobre-inventario. Quiebre y bajo mínimo son excluyentes entre sí (un
        // agotado no se cuenta dos veces); exceso y sin rotación viven en el
        // universo de existencia positiva, igual que en sobre-inventario.
        const clasificado = `${baseSql},
clasificado AS (
    SELECT
        b.*,
        CASE WHEN b.Exi <= 0 AND b.DemandaDiaria > 0                 THEN 1 ELSE 0 END AS EsQuiebre,
        CASE WHEN NOT (b.Exi <= 0 AND b.DemandaDiaria > 0)
              AND b.Minimo > 0 AND b.Exi < b.Minimo                  THEN 1 ELSE 0 END AS EsBajoMinimo,
        CASE WHEN b.Exi > 0 AND b.DemandaDiaria > 0
              AND b.Cobertura > ${filters.diasExceso}                THEN 1 ELSE 0 END AS EsExceso,
        CASE WHEN b.Exi > 0 AND b.DemandaDiaria <= 0                 THEN 1 ELSE 0 END AS EsSinRotacion
    FROM base b
)`;

        const resumenSql = `${clasificado}
SELECT
    IdSucursal,
    Sucursal,
    COUNT(*)                                                   AS SkusTotales,
    SUM(CASE WHEN Exi > 0 THEN 1 ELSE 0 END)                   AS SkusConExistencia,
    SUM(CASE WHEN Exi = 0 THEN 1 ELSE 0 END)                   AS SkusEnCero,
    SUM(CASE WHEN Exi < 0 THEN 1 ELSE 0 END)                   AS SkusNegativos,
    SUM(CASE WHEN Exi > 0 THEN Exi ELSE 0 END)                 AS Unidades,
    SUM(CASE WHEN Exi > 0 THEN ValorInventario ELSE 0 END)     AS Valorizado,
    SUM(CASE WHEN Exi < 0 THEN ValorInventario ELSE 0 END)     AS ValorNegativo,
    SUM(EsQuiebre)                                             AS Quiebres,
    SUM(EsBajoMinimo)                                          AS BajoMinimo,
    SUM(EsExceso)                                              AS Exceso,
    SUM(EsSinRotacion)                                         AS SinRotacion,
    SUM(CASE WHEN Exi > 0 THEN Exi ELSE 0 END)
        / NULLIF(SUM(DemandaDiaria), 0)                        AS CoberturaGlobal,
    SUM(UnidadesPeriodo * CostoUnitario)                       AS CostoVenta,
    SUM(VentaPeriodo)                                          AS VentaPeriodo,
    SUM(CASE WHEN Fuente = 'movimientos' THEN 1 ELSE 0 END)    AS DesdeMovimientos
FROM clasificado
GROUP BY IdSucursal, Sucursal
ORDER BY Valorizado DESC`;

        const data = (await query(resumenSql, params)) as SucursalRow[];

        const num = (v: unknown) => Number(v || 0);
        const sum = (k: keyof SucursalRow) => data.reduce((a, r) => a + num(r[k]), 0);

        const kpis = {
            valorizado: sum('Valorizado'),
            valorNegativo: sum('ValorNegativo'),
            unidades: sum('Unidades'),
            skusConExistencia: sum('SkusConExistencia'),
            skusEnCero: sum('SkusEnCero'),
            skusNegativos: sum('SkusNegativos'),
            quiebres: sum('Quiebres'),
            bajoMinimo: sum('BajoMinimo'),
            exceso: sum('Exceso'),
            sinRotacion: sum('SinRotacion'),
            sucursales: data.length,
            desdeMovimientos: sum('DesdeMovimientos'),
            skusTotales: sum('SkusTotales'),
        };

        let rows: unknown[] = [];
        if (conDetalle) {
            const detalleSql = `${clasificado}
SELECT
    IdArticulo, IdSucursal, Sucursal, Producto, Codigo, Depto, Marca,
    Exi, CostoUnitario, ValorInventario, DemandaDiaria, UnidadesPeriodo,
    Minimo, Cobertura, UltimaVenta, Fuente,
    CASE
        WHEN EsQuiebre     = 1 THEN 'quiebre'
        WHEN EsBajoMinimo  = 1 THEN 'bajo_minimo'
        WHEN EsSinRotacion = 1 THEN 'sin_rotacion'
        WHEN EsExceso      = 1 THEN 'exceso'
        ELSE 'sano'
    END AS Estado
FROM clasificado
ORDER BY ValorInventario DESC
LIMIT ${filters.limit}`;
            rows = (await query(detalleSql, params)) as unknown[];
        }

        return NextResponse.json({
            success: true,
            meta: {
                dias: filters.dias,
                diasExceso: filters.diasExceso,
                sucursales: filters.sucursales,
                conDetalle,
            },
            kpis,
            data,
            rows,
        });
    } catch (error: unknown) {
        console.error('Error en reporte de inventario por sucursal:', error);
        return NextResponse.json(
            { success: false, error: getErrorMessage(error, 'Error al calcular el inventario por sucursal') },
            { status: 500 }
        );
    }
}
