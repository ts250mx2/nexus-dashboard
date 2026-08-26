import { NextRequest, NextResponse } from 'next/server';
import { toIso } from '@/lib/dates';
import { query } from '@/lib/db';
import { getErrorMessage } from '@/lib/errors';
import {
    ArticuloSucursalInfo,
    MAX_RENGLONES,
    MovimientoRow,
    MovimientosMeta,
    buildArticuloSucursalQuery,
    buildMovimientosQuery,
} from '@/lib/inventory/movimientos';
import { calcularSaldos, existenciaActual, resumirPorTipo } from '@/lib/inventory/movimientos-view';
import { parseEntero } from '@/lib/inventory/params';

/**
 * MOVIMIENTOS DE UN ARTÍCULO EN UNA SUCURSAL
 *
 * Réplica de la pantalla "Reporte Movimientos" del ERP tal como se abre desde
 * "Existencia de artículos": lista cronológica con saldo por renglón y resumen
 * por tipo de movimiento.
 *
 * Parámetros: `articulo` y `sucursal` (obligatorios) y `todos=1` para ver la
 * historia completa en vez de solo lo posterior al último ajuste físico.
 */

type Fila = Record<string, unknown>;

const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));

function normalizarInfo(fila: Fila): ArticuloSucursalInfo {
    return {
        IdArticulo: num(fila.IdArticulo),
        Codigo: String(fila.Codigo ?? 'S/C'),
        Descripcion: String(fila.Descripcion ?? ''),
        IdSucursal: num(fila.IdSucursal),
        Sucursal: String(fila.Sucursal ?? ''),
        ExiCorte: numOrNull(fila.ExiCorte),
        FechaCorte: toIso(fila.FechaCorte),
        ExiCosto: numOrNull(fila.ExiCosto),
    };
}

function normalizarMovimiento(fila: Fila): Omit<MovimientoRow, 'Exi'> {
    return {
        IdComputadora: num(fila.IdComputadora),
        TipoMovimiento: num(fila.TipoMovimiento),
        Folio: num(fila.Folio),
        Iteracion: num(fila.Iteracion),
        Concepto: String(fila.Concepto ?? ''),
        Mov: num(fila.Mov),
        IdUsuario: num(fila.IdUsuario),
        Usuario: fila.Usuario ? String(fila.Usuario) : null,
        FechaMovimiento: toIso(fila.FechaMovimiento) ?? '',
        FechaAct: toIso(fila.FechaAct),
        Dia: String(fila.Dia ?? ''),
        Editado: num(fila.Editado),
    };
}

export async function GET(req: NextRequest) {
    try {
        const searchParams = new URL(req.url).searchParams;
        const articulo = parseEntero(searchParams.get('articulo'));
        const sucursal = parseEntero(searchParams.get('sucursal'));
        const verTodos = searchParams.get('todos') === '1';

        if (articulo === null || sucursal === null) {
            return NextResponse.json(
                { success: false, error: 'Se requieren un artículo y una sucursal válidos' },
                { status: 400 }
            );
        }

        // En serie a propósito: el pool es de 10 conexiones para toda la app y el
        // encabezado tarda milisegundos; en paralelo cada petición retendría dos.
        const t0 = performance.now();
        const encabezado = buildArticuloSucursalQuery(articulo, sucursal);
        const infoRows = (await query(encabezado.sql, encabezado.params)) as Fila[];
        if (!infoRows[0]) {
            return NextResponse.json(
                { success: false, error: 'No se encontró el artículo o la sucursal' },
                { status: 404 }
            );
        }

        const t1 = performance.now();
        const detalle = buildMovimientosQuery(articulo, sucursal, verTodos);
        const movRows = (await query(detalle.sql, detalle.params)) as Fila[];
        const t2 = performance.now();

        const info = normalizarInfo(infoRows[0]);
        // La consulta viene del más reciente al más antiguo (por el LIMIT); el
        // cálculo de saldos espera orden cronológico.
        const base = movRows.map(normalizarMovimiento).reverse();
        const exiFinal = existenciaActual(base, info, info.ExiCosto);
        const movimientos: MovimientoRow[] = calcularSaldos(base, exiFinal);
        const resumen = resumirPorTipo(movimientos);

        const meta: MovimientosMeta = {
            ...info,
            exiFinal,
            verTodos,
            truncado: movRows.length >= MAX_RENGLONES,
            calculadoEn: new Date().toISOString(),
        };
        const t3 = performance.now();

        const respuesta = NextResponse.json({ success: true, meta, resumen, movimientos });
        // Desglose de tiempos visible en las DevTools del navegador (pestaña Timing).
        respuesta.headers.set(
            'Server-Timing',
            `encabezado;dur=${(t1 - t0).toFixed(0)}, detalle;dur=${(t2 - t1).toFixed(0)}, calculo;dur=${(t3 - t2).toFixed(0)}`
        );
        return respuesta;
    } catch (error: unknown) {
        // El detalle (host, credenciales, SQL) se queda en el log del servidor.
        console.error('Error en reporte de movimientos de artículo:', getErrorMessage(error), error);
        return NextResponse.json(
            { success: false, error: 'Error al consultar los movimientos del artículo' },
            { status: 500 }
        );
    }
}
