import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getErrorMessage } from '@/lib/errors';
import { buildBaseQuery } from '@/lib/inventory/base-query';
import { parseFilters } from '@/lib/inventory/params';
import { DIAS_SURTIDO_DEFAULT } from '@/lib/inventory/source';

/**
 * SUGERENCIA DE PEDIDOS
 *
 * Modelo de punto de reorden:
 *
 *   Disponible     = existencia + mercancía en tránsito
 *   PuntoReorden   = mínimo efectivo (el capturado en el ERP o el derivado de la demanda)
 *   NivelObjetivo  = demanda diaria × (lead time + cobertura objetivo)
 *   Sugerido       = techo(NivelObjetivo − Disponible), solo si Disponible ≤ PuntoReorden
 *
 * Descontar el tránsito es lo que evita pedir dos veces lo mismo: una orden de
 * compra pendiente o un traspaso enviado ya cubren parte del hueco.
 *
 * Se sugiere únicamente lo que tiene demanda real en la ventana analizada o un
 * mínimo configurado en el ERP; así la lista sale accionable y no con el catálogo entero.
 */

const MAX_FILAS = 8000;

interface SugerenciaRow {
    IdArticulo: number;
    IdSucursal: number;
    Sucursal: string;
    Producto: string;
    Codigo: string;
    Depto: string;
    Marca: string;
    IdProveedor: number;
    Proveedor: string;
    Exi: number;
    EnTransito: number;
    Disponible: number;
    PuntoReorden: number;
    NivelObjetivo: number;
    Sugerido: number;
    CostoUnitario: number;
    CostoSugerido: number;
    DemandaDiaria: number;
    Cobertura: number | null;
    DiasSurtidoUsado: number;
    Urgencia: 'agotado' | 'critico' | 'reponer';
    /** De dónde salió la sugerencia: de la demanda real o del mínimo capturado en el ERP. */
    Origen: 'demanda' | 'minimo_erp';
}

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const filters = parseFilters(url.searchParams);
        /** Cuando está activo se ignora el tránsito y se pide el hueco completo. */
        const ignorarTransito = url.searchParams.get('ignorarTransito') === '1';

        const { sql: baseSql, params } = buildBaseQuery({
            dias: filters.dias,
            sucursales: filters.sucursales,
            search: filters.search,
            conTransito: true,
        });

        const transitoExpr = ignorarTransito ? '0' : 'b.EnTransito';

        const sql = `${baseSql},
calculado AS (
    SELECT
        b.*,
        (b.Exi + ${transitoExpr})                                    AS Disponible,
        CASE WHEN b.DiasSurtido > 0 THEN b.DiasSurtido ELSE ${DIAS_SURTIDO_DEFAULT} END AS DiasSurtidoUsado,
        b.DemandaDiaria * (
            (CASE WHEN b.DiasSurtido > 0 THEN b.DiasSurtido ELSE ${DIAS_SURTIDO_DEFAULT} END)
          + (CASE WHEN b.DiasMax > 0 THEN b.DiasMax ELSE ${filters.diasCobertura} END)
        )                                                            AS NivelObjetivo
    FROM base b
    WHERE b.DemandaDiaria > 0 OR b.ExiMinRes > 0
),
sugerido AS (
    SELECT
        c.*,
        CEIL(GREATEST(
            GREATEST(c.NivelObjetivo, c.Minimo) - c.Disponible,
            0
        ))                                                           AS Sugerido
    FROM calculado c
    WHERE c.Disponible <= c.Minimo
)
SELECT
    s.IdArticulo, s.IdSucursal, s.Sucursal, s.Producto, s.Codigo, s.Depto, s.Marca,
    s.IdProveedor,
    COALESCE(NULLIF(PR.Socio, ''), 'Sin proveedor asignado')         AS Proveedor,
    s.Exi, s.EnTransito, s.Disponible, s.DemandaDiaria, s.Cobertura,
    s.CostoUnitario, s.DiasSurtidoUsado,
    s.Minimo                                                         AS PuntoReorden,
    s.NivelObjetivo,
    s.Sugerido,
    (s.Sugerido * s.CostoUnitario)                                   AS CostoSugerido,
    CASE
        WHEN s.Exi <= 0                    THEN 'agotado'
        WHEN s.Disponible < s.Minimo * 0.5 THEN 'critico'
        ELSE 'reponer'
    END                                                              AS Urgencia,
    CASE WHEN s.DemandaDiaria > 0 THEN 'demanda' ELSE 'minimo_erp' END AS Origen
FROM sugerido s
LEFT JOIN tblSocios PR ON PR.IdSocio = s.IdProveedor
WHERE s.Sugerido > 0
ORDER BY (s.Sugerido * s.CostoUnitario) DESC
LIMIT ${MAX_FILAS}`;

        const rows = (await query(sql, params)) as SugerenciaRow[];

        const num = (v: unknown) => Number(v || 0);

        const kpis = {
            skusASurtir: rows.length,
            unidadesSugeridas: rows.reduce((a, r) => a + num(r.Sugerido), 0),
            inversionEstimada: rows.reduce((a, r) => a + num(r.CostoSugerido), 0),
            proveedores: new Set(rows.map(r => r.Proveedor)).size,
            sucursales: new Set(rows.map(r => r.IdSucursal)).size,
            agotados: rows.filter(r => r.Urgencia === 'agotado').length,
            porMinimoErp: rows.filter(r => r.Origen === 'minimo_erp').length,
            unidadesEnTransito: rows.reduce((a, r) => a + num(r.EnTransito), 0),
        };

        const porProveedor = (() => {
            const map = new Map<string, {
                Proveedor: string;
                IdProveedor: number;
                Skus: number;
                Unidades: number;
                Costo: number;
            }>();
            for (const r of rows) {
                const acc = map.get(r.Proveedor) ?? {
                    Proveedor: r.Proveedor,
                    IdProveedor: r.IdProveedor,
                    Skus: 0,
                    Unidades: 0,
                    Costo: 0,
                };
                acc.Skus += 1;
                acc.Unidades += num(r.Sugerido);
                acc.Costo += num(r.CostoSugerido);
                map.set(r.Proveedor, acc);
            }
            return [...map.values()].sort((a, b) => b.Costo - a.Costo);
        })();

        const porSucursal = (() => {
            const map = new Map<number, {
                IdSucursal: number;
                Sucursal: string;
                Skus: number;
                Unidades: number;
                Costo: number;
                Agotados: number;
            }>();
            for (const r of rows) {
                const acc = map.get(r.IdSucursal) ?? {
                    IdSucursal: r.IdSucursal,
                    Sucursal: r.Sucursal,
                    Skus: 0,
                    Unidades: 0,
                    Costo: 0,
                    Agotados: 0,
                };
                acc.Skus += 1;
                acc.Unidades += num(r.Sugerido);
                acc.Costo += num(r.CostoSugerido);
                if (r.Urgencia === 'agotado') acc.Agotados += 1;
                map.set(r.IdSucursal, acc);
            }
            return [...map.values()].sort((a, b) => b.Costo - a.Costo);
        })();

        return NextResponse.json({
            success: true,
            meta: {
                dias: filters.dias,
                diasCobertura: filters.diasCobertura,
                sucursales: filters.sucursales,
                ignorarTransito,
                filasTotales: rows.length,
                truncado: rows.length >= MAX_FILAS,
            },
            kpis,
            porProveedor,
            porSucursal,
            rows: rows.slice(0, filters.limit),
        });
    } catch (error: unknown) {
        console.error('Error en sugerencia de pedidos:', error);
        return NextResponse.json(
            { success: false, error: getErrorMessage(error, 'Error al calcular la sugerencia de pedidos') },
            { status: 500 }
        );
    }
}
