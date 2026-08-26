import { NextRequest, NextResponse } from 'next/server';
import { toIso } from '@/lib/dates';
import { query } from '@/lib/db';
import { fechaCorteComun, fechaGeneracionMovimientos } from '@/lib/inventory/erp';
import { ExistenciaRow, buildExistenciasQuery } from '@/lib/inventory/existencias';
import { parseSucursales } from '@/lib/inventory/params';

/**
 * EXISTENCIAS DE ARTÍCULOS
 *
 * Réplica de la pantalla "Existencia de artículos" del ERP:
 *   ExiInicial (corte tipo 99) + Entradas - Salidas = ExiFinal
 *
 * Devuelve la lista COMPLETA de artículos activos de UNA sucursal (parámetro
 * `sucursal`, obligatorio). El filtro por texto se hace en el cliente sobre esa
 * lista; calcular toda la red de una vez tarda ~19 s (ver
 * src/lib/inventory/existencias.ts).
 */

interface ExistenciasMeta {
    sucursal: number | null;
    /** No se indicó una sucursal válida; no se consultó la base. */
    requiereSucursal: boolean;
    /** Fecha del corte tipo 99 que sirvió de existencia inicial (la más común). */
    fechaCorte: string | null;
    /**
     * Última vez que el ERP regeneró tblReporteMovimientos. Es una tabla de
     * trabajo: los movimientos posteriores a esa hora no existen en ella.
     */
    generadoEn: string | null;
    /** Movimiento más reciente registrado en la tabla para esta sucursal. */
    ultimoMovimiento: string | null;
    calculadoEn: string;
}

function ultimoMovimiento(rows: ExistenciaRow[]): string | null {
    return rows.reduce<string | null>((max, r) => {
        const actual = toIso(r.UltimaActualizacion);
        if (!actual) return max;
        return !max || actual > max ? actual : max;
    }, null);
}

export async function GET(req: NextRequest) {
    try {
        const searchParams = new URL(req.url).searchParams;
        const raw = (searchParams.get('sucursal') || '').trim();
        const ids = parseSucursales(raw);

        if (raw && ids.length !== 1) {
            return NextResponse.json(
                { success: false, error: 'El parámetro "sucursal" debe ser un solo ID entero positivo' },
                { status: 400 }
            );
        }

        const sucursal = ids.length === 1 ? ids[0] : null;

        if (sucursal === null) {
            const meta: ExistenciasMeta = {
                sucursal: null,
                requiereSucursal: true,
                fechaCorte: null,
                generadoEn: null,
                ultimoMovimiento: null,
                calculadoEn: new Date().toISOString(),
            };
            return NextResponse.json({ success: true, meta, rows: [] as ExistenciaRow[] });
        }

        const [rows, generadoEn] = await Promise.all([
            query(buildExistenciasQuery(sucursal)) as Promise<ExistenciaRow[]>,
            fechaGeneracionMovimientos(),
        ]);

        const meta: ExistenciasMeta = {
            sucursal,
            requiereSucursal: false,
            fechaCorte: fechaCorteComun(rows),
            generadoEn,
            ultimoMovimiento: ultimoMovimiento(rows),
            calculadoEn: new Date().toISOString(),
        };

        return NextResponse.json({ success: true, meta, rows });
    } catch (error: unknown) {
        // El detalle (mensaje de MySQL con nombres de tablas, host, etc.) se queda
        // en el registro del servidor; al cliente solo le llega un mensaje genérico.
        console.error('Error en reporte de existencias:', error);
        return NextResponse.json(
            { success: false, error: 'No se pudieron calcular las existencias. Inténtalo de nuevo en unos segundos.' },
            { status: 500 }
        );
    }
}
