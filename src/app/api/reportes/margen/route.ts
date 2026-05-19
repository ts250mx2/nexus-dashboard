import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Reporte de Margen y Rentabilidad
 *
 * Cruza tblDetalleVentas (revenue real) con tblCostoInventario (costo unitario
 * vigente por sucursal) y agrupa por la dimensión solicitada.
 *
 * Parámetros (query string):
 *  - startDate (YYYY-MM-DD) — default: día 1 del mes actual
 *  - endDate   (YYYY-MM-DD) — default: hoy
 *  - groupBy   ('sucursal' | 'depto' | 'articulo' | 'categoria' | 'marca') — default: sucursal
 *  - sucursalId (opcional) — filtra a una sucursal
 *  - depto (opcional) — filtra a un departamento
 *  - limit (opcional) — top N (default 100 para artículo, sin tope para los demás)
 */

const GROUP_MAP: Record<string, { selectExpr: string; joinExtra: string; alias: string }> = {
    sucursal: {
        selectExpr: 'S.Sucursal',
        joinExtra: 'INNER JOIN tblSucursales S ON V.IdSucursal = S.IdSucursal',
        alias: 'Sucursal'
    },
    depto: {
        selectExpr: 'A.Depto',
        joinExtra: '',
        alias: 'Depto'
    },
    articulo: {
        selectExpr: 'A.Producto',
        joinExtra: '',
        alias: 'Producto'
    },
    categoria: {
        selectExpr: 'IFNULL(C.Categoria, "(Sin categoría)")',
        joinExtra: 'LEFT JOIN tblCategorias C ON A.IdCategoria = C.IdCategoria',
        alias: 'Categoria'
    },
    marca: {
        selectExpr: 'IFNULL(A.Marca, "(Sin marca)")',
        joinExtra: '',
        alias: 'Marca'
    }
};

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const today = new Date();
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);

        const startDate = url.searchParams.get('startDate') || fmt(firstOfMonth);
        const endDate = url.searchParams.get('endDate') || fmt(today);
        const groupByKey = (url.searchParams.get('groupBy') || 'sucursal').toLowerCase();
        const sucursalId = url.searchParams.get('sucursalId');
        const depto = url.searchParams.get('depto');
        const limitParam = parseInt(url.searchParams.get('limit') || '0', 10);

        const gb = GROUP_MAP[groupByKey] || GROUP_MAP.sucursal;

        const whereClauses: string[] = [
            'V.Status = 0',
            'V.FechaVenta >= ?',
            'V.FechaVenta < DATE_ADD(?, INTERVAL 1 DAY)'
        ];
        const params: any[] = [startDate, endDate];

        if (sucursalId) {
            whereClauses.push('V.IdSucursal = ?');
            params.push(sucursalId);
        }
        if (depto) {
            whereClauses.push('A.Depto = ?');
            params.push(depto);
        }

        const limit = limitParam > 0 ? Math.min(limitParam, 1000) : (groupByKey === 'articulo' ? 100 : 200);

        const sql = `
            SELECT
                ${gb.selectExpr} AS Grupo,
                SUM(DV.Cantidad) AS Unidades,
                SUM(DV.Cantidad * DV.PrecioVenta - IFNULL(DV.Descuento, 0)) AS Ingreso,
                SUM(DV.Cantidad * IFNULL(CI.PrecioBase, A.PrecioBase)) AS Costo,
                SUM(DV.Cantidad * DV.PrecioVenta - IFNULL(DV.Descuento, 0))
                  - SUM(DV.Cantidad * IFNULL(CI.PrecioBase, A.PrecioBase)) AS Utilidad,
                CASE
                    WHEN SUM(DV.Cantidad * DV.PrecioVenta - IFNULL(DV.Descuento, 0)) = 0 THEN 0
                    ELSE (
                        (SUM(DV.Cantidad * DV.PrecioVenta - IFNULL(DV.Descuento, 0))
                         - SUM(DV.Cantidad * IFNULL(CI.PrecioBase, A.PrecioBase)))
                        / SUM(DV.Cantidad * DV.PrecioVenta - IFNULL(DV.Descuento, 0)) * 100
                    )
                END AS MargenPct,
                COUNT(DISTINCT V.IdVenta) AS Tickets
            FROM tblDetalleVentas DV
            INNER JOIN tblVentas V ON DV.IdVenta = V.IdVenta AND DV.IdSucursal = V.IdSucursal
            INNER JOIN tblArticulos A ON DV.IdArticulo = A.IdArticulo
            LEFT JOIN tblCostoInventario CI ON CI.IdArticulo = DV.IdArticulo AND CI.IdSucursal = DV.IdSucursal
            ${gb.joinExtra}
            WHERE ${whereClauses.join(' AND ')}
            GROUP BY ${gb.selectExpr}
            ORDER BY Utilidad DESC
            LIMIT ${limit}
        `;

        const rows = await query(sql, params);

        // KPIs globales (sin agrupación)
        const totalsSql = `
            SELECT
                SUM(DV.Cantidad * DV.PrecioVenta - IFNULL(DV.Descuento, 0)) AS Ingreso,
                SUM(DV.Cantidad * IFNULL(CI.PrecioBase, A.PrecioBase)) AS Costo,
                SUM(DV.Cantidad) AS Unidades,
                COUNT(DISTINCT V.IdVenta) AS Tickets
            FROM tblDetalleVentas DV
            INNER JOIN tblVentas V ON DV.IdVenta = V.IdVenta AND DV.IdSucursal = V.IdSucursal
            INNER JOIN tblArticulos A ON DV.IdArticulo = A.IdArticulo
            LEFT JOIN tblCostoInventario CI ON CI.IdArticulo = DV.IdArticulo AND CI.IdSucursal = DV.IdSucursal
            WHERE ${whereClauses.join(' AND ')}
        `;

        const totalsRows = await query(totalsSql, params);
        const t = totalsRows[0] || {};
        const ingreso = Number(t.Ingreso) || 0;
        const costo = Number(t.Costo) || 0;
        const utilidad = ingreso - costo;
        const margenPct = ingreso > 0 ? (utilidad / ingreso) * 100 : 0;

        return NextResponse.json({
            success: true,
            filters: { startDate, endDate, groupBy: groupByKey, sucursalId, depto },
            kpis: {
                ingreso,
                costo,
                utilidad,
                margenPct,
                unidades: Number(t.Unidades) || 0,
                tickets: Number(t.Tickets) || 0
            },
            groupAlias: gb.alias,
            data: rows
        });
    } catch (error: any) {
        console.error('Margen report error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
