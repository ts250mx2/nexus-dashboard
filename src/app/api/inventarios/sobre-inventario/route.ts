import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getErrorMessage } from '@/lib/errors';
import { buildBaseQuery } from '@/lib/inventory/base-query';
import { parseFilters } from '@/lib/inventory/params';

/**
 * SOBRE-INVENTARIO
 *
 * Detecta dos situaciones distintas y no las mezcla:
 *
 *  - EXCESO: el artículo sí rota, pero la existencia cubre más días de los que
 *    marca el umbral. El sobrante se mide contra la cobertura objetivo.
 *  - SIN ROTACIÓN: el artículo tiene existencia y no registró una sola venta en
 *    la ventana analizada. Aquí sobra todo, no una parte.
 *
 * El capital inmovilizado se valúa a costo unitario de la sucursal.
 */

const MAX_FILAS = 10000;

interface ExcesoRow {
    IdArticulo: number;
    IdSucursal: number;
    Sucursal: string;
    Producto: string;
    Codigo: string;
    Depto: string;
    Marca: string;
    Exi: number;
    CostoUnitario: number;
    ValorInventario: number;
    Cobertura: number | null;
    DemandaDiaria: number;
    UnidadesExceso: number;
    CapitalInmovilizado: number;
    DiasSinMovimiento: number | null;
    UltimaSalida: string | null;
    Estado: 'exceso' | 'sin_rotacion';
    Fuente: 'movimientos' | 'costo';
}

export async function GET(req: NextRequest) {
    try {
        const filters = parseFilters(new URL(req.url).searchParams);
        const { sql: baseSql, params } = buildBaseQuery({
            dias: filters.dias,
            sucursales: filters.sucursales,
            search: filters.search,
        });

        const sql = `${baseSql},
clasificado AS (
    SELECT
        b.*,
        CASE
            WHEN b.DemandaDiaria <= 0                        THEN 'sin_rotacion'
            WHEN b.Cobertura > ${filters.diasExceso}         THEN 'exceso'
            ELSE 'ok'
        END AS Estado,
        CASE
            WHEN b.DemandaDiaria <= 0 THEN b.Exi
            ELSE GREATEST(b.Exi - (b.DemandaDiaria * ${filters.diasCobertura}), 0)
        END AS UnidadesExceso,
        CASE
            WHEN b.UltimaSalida IS NULL THEN NULL
            ELSE DATEDIFF(CURDATE(), DATE(b.UltimaSalida))
        END AS DiasSinMovimiento
    FROM base b
    WHERE b.Exi > 0
)
SELECT
    IdArticulo, IdSucursal, Sucursal, Producto, Codigo, Depto, Marca,
    Exi, CostoUnitario, ValorInventario, Cobertura, DemandaDiaria,
    UnidadesExceso, DiasSinMovimiento, UltimaSalida, Estado, Fuente,
    (UnidadesExceso * CostoUnitario) AS CapitalInmovilizado
FROM clasificado
WHERE Estado <> 'ok' AND UnidadesExceso > 0
ORDER BY (UnidadesExceso * CostoUnitario) DESC
LIMIT ${MAX_FILAS}`;

        const rows = (await query(sql, params)) as ExcesoRow[];

        const num = (v: unknown) => Number(v || 0);
        const exceso = rows.filter(r => r.Estado === 'exceso');
        const sinRotacion = rows.filter(r => r.Estado === 'sin_rotacion');

        const kpis = {
            capitalInmovilizado: rows.reduce((a, r) => a + num(r.CapitalInmovilizado), 0),
            skusExceso: exceso.length,
            valorExceso: exceso.reduce((a, r) => a + num(r.CapitalInmovilizado), 0),
            skusSinRotacion: sinRotacion.length,
            valorSinRotacion: sinRotacion.reduce((a, r) => a + num(r.CapitalInmovilizado), 0),
            unidadesExceso: rows.reduce((a, r) => a + num(r.UnidadesExceso), 0),
        };

        const porDepto = (() => {
            const map = new Map<string, { clave: string; Capital: number; Skus: number; Unidades: number }>();
            for (const r of rows) {
                const acc = map.get(r.Depto) ?? { clave: r.Depto, Capital: 0, Skus: 0, Unidades: 0 };
                acc.Capital += num(r.CapitalInmovilizado);
                acc.Skus += 1;
                acc.Unidades += num(r.UnidadesExceso);
                map.set(r.Depto, acc);
            }
            return [...map.values()].sort((a, b) => b.Capital - a.Capital).slice(0, 15);
        })();

        const porSucursal = (() => {
            const map = new Map<number, {
                IdSucursal: number;
                Sucursal: string;
                Capital: number;
                SkusExceso: number;
                SkusSinRotacion: number;
            }>();
            for (const r of rows) {
                const acc = map.get(r.IdSucursal) ?? {
                    IdSucursal: r.IdSucursal,
                    Sucursal: r.Sucursal,
                    Capital: 0,
                    SkusExceso: 0,
                    SkusSinRotacion: 0,
                };
                acc.Capital += num(r.CapitalInmovilizado);
                if (r.Estado === 'exceso') acc.SkusExceso += 1;
                else acc.SkusSinRotacion += 1;
                map.set(r.IdSucursal, acc);
            }
            return [...map.values()].sort((a, b) => b.Capital - a.Capital);
        })();

        return NextResponse.json({
            success: true,
            meta: {
                dias: filters.dias,
                diasCobertura: filters.diasCobertura,
                diasExceso: filters.diasExceso,
                sucursales: filters.sucursales,
                filasTotales: rows.length,
                truncado: rows.length >= MAX_FILAS,
            },
            kpis,
            porSucursal,
            porDepto,
            rows: rows.slice(0, filters.limit),
        });
    } catch (error: unknown) {
        console.error('Error en reporte de sobre-inventario:', error);
        return NextResponse.json(
            { success: false, error: getErrorMessage(error, 'Error al calcular el sobre-inventario') },
            { status: 500 }
        );
    }
}
