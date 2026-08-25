import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getErrorMessage } from '@/lib/errors';
import { buildBaseQuery } from '@/lib/inventory/base-query';
import { parseFilters } from '@/lib/inventory/params';

/**
 * QUIEBRES DE STOCK
 *
 * Devuelve los artículos agotados o por debajo de su mínimo, únicamente en las
 * sucursales donde el artículo efectivamente se vende o tiene mínimo configurado.
 *
 * La venta perdida es una ESTIMACIÓN: se asume que el artículo lleva sin stock
 * desde su última venta (tope: la ventana de demanda) y se valúa a su precio
 * promedio de venta real del periodo.
 */

/** Tope de filas que se traen para poder calcular KPIs exactos sin paginar en SQL. */
const MAX_FILAS = 8000;

interface QuiebreRow {
    IdArticulo: number;
    IdSucursal: number;
    Sucursal: string;
    Producto: string;
    Codigo: string;
    Depto: string;
    Marca: string;
    Exi: number;
    Minimo: number;
    UnidadesFaltantes: number;
    DemandaDiaria: number;
    UnidadesPeriodo: number;
    PrecioPromedio: number;
    CostoUnitario: number;
    DiasSinStock: number;
    VentaPerdida: number;
    CostoReposicion: number;
    UltimaVenta: string | null;
    Estado: 'quiebre' | 'bajo_minimo';
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
            WHEN b.Exi <= 0 AND b.DemandaDiaria > 0           THEN 'quiebre'
            WHEN b.Minimo > 0 AND b.Exi < b.Minimo            THEN 'bajo_minimo'
            ELSE 'ok'
        END AS Estado,
        CASE
            WHEN b.Exi <= 0 AND b.UltimaVenta IS NOT NULL
                THEN LEAST(GREATEST(DATEDIFF(CURDATE(), DATE(b.UltimaVenta)), 0), ${filters.dias})
            ELSE 0
        END AS DiasSinStock
    FROM base b
    WHERE b.DemandaDiaria > 0
       OR (b.Minimo > 0 AND b.Exi < b.Minimo)
)
SELECT
    IdArticulo, IdSucursal, Sucursal, Producto, Codigo, Depto, Marca,
    Exi, Minimo, DemandaDiaria, UnidadesPeriodo, PrecioPromedio, CostoUnitario,
    UltimaVenta, Estado, DiasSinStock, Fuente,
    GREATEST(Minimo - Exi, 0)                             AS UnidadesFaltantes,
    (DemandaDiaria * DiasSinStock * PrecioPromedio)       AS VentaPerdida,
    (GREATEST(Minimo - Exi, 0) * CostoUnitario)           AS CostoReposicion
FROM clasificado
WHERE Estado <> 'ok'
ORDER BY (DemandaDiaria * DiasSinStock * PrecioPromedio) DESC, DemandaDiaria DESC
LIMIT ${MAX_FILAS}`;

        const rows = (await query(sql, params)) as QuiebreRow[];

        const num = (v: unknown) => Number(v || 0);

        const kpis = {
            skusQuiebre: rows.filter(r => r.Estado === 'quiebre').length,
            skusBajoMinimo: rows.filter(r => r.Estado === 'bajo_minimo').length,
            ventaPerdida: rows.reduce((a, r) => a + num(r.VentaPerdida), 0),
            unidadesFaltantes: rows.reduce((a, r) => a + num(r.UnidadesFaltantes), 0),
            costoReposicion: rows.reduce((a, r) => a + num(r.CostoReposicion), 0),
            sucursalesAfectadas: new Set(rows.map(r => r.IdSucursal)).size,
        };

        const porSucursalMap = new Map<number, {
            IdSucursal: number;
            Sucursal: string;
            Quiebres: number;
            BajoMinimo: number;
            VentaPerdida: number;
            UnidadesFaltantes: number;
        }>();

        for (const r of rows) {
            const acc = porSucursalMap.get(r.IdSucursal) ?? {
                IdSucursal: r.IdSucursal,
                Sucursal: r.Sucursal,
                Quiebres: 0,
                BajoMinimo: 0,
                VentaPerdida: 0,
                UnidadesFaltantes: 0,
            };
            if (r.Estado === 'quiebre') acc.Quiebres += 1;
            else acc.BajoMinimo += 1;
            acc.VentaPerdida += num(r.VentaPerdida);
            acc.UnidadesFaltantes += num(r.UnidadesFaltantes);
            porSucursalMap.set(r.IdSucursal, acc);
        }

        const porSucursal = [...porSucursalMap.values()].sort((a, b) => b.VentaPerdida - a.VentaPerdida);

        return NextResponse.json({
            success: true,
            meta: {
                dias: filters.dias,
                sucursales: filters.sucursales,
                filasTotales: rows.length,
                truncado: rows.length >= MAX_FILAS,
            },
            kpis,
            porSucursal,
            rows: rows.slice(0, filters.limit),
        });
    } catch (error: unknown) {
        console.error('Error en reporte de quiebres de stock:', error);
        return NextResponse.json(
            { success: false, error: getErrorMessage(error, 'Error al calcular los quiebres de stock') },
            { status: 500 }
        );
    }
}
