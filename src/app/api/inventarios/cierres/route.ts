import { NextRequest, NextResponse } from 'next/server';
import { RETENCION_DIAS, cierreEnCurso, generarCierre, listarCierres } from '@/lib/inventory/cierres';
import { autorizadoCierres } from '@/lib/inventory/cierres-auth';
import { parseSucursales } from '@/lib/inventory/params';
import { cronLimiter } from '@/lib/rate-limit';

/**
 * CIERRES DE INVENTARIO
 *
 * GET  → cabeceras de los cierres conservados (hoy + RETENCION_DIAS días).
 * POST → toma la foto del día de todas las sucursales (o de `sucursales=1,2`).
 *        Reemplaza el cierre del día si ya existía (nunca por uno fallido) y
 *        purga lo más viejo. Solo puede haber una corrida a la vez (409 si hay
 *        otra en curso) y como mucho unas pocas por minuto.
 *
 * Pensado para una tarea programada a la hora de cierre (23:55):
 *
 *   curl -X POST -H "x-cierre-token: <CIERRE_TOKEN>" http://localhost:3012/api/inventarios/cierres
 *
 * Ambos métodos exigen sesión del portal o el encabezado `x-cierre-token`.
 */

export const maxDuration = 300;

export async function GET(req: NextRequest) {
    if (!(await autorizadoCierres(req))) {
        return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }
    try {
        const data = await listarCierres();
        return NextResponse.json({ success: true, retencionDias: RETENCION_DIAS, data });
    } catch (error: unknown) {
        console.error('Error al listar cierres de inventario:', error);
        return NextResponse.json(
            { success: false, error: 'No se pudieron leer los cierres de inventario.' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    if (!(await autorizadoCierres(req))) {
        return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }
    if (cierreEnCurso()) {
        return NextResponse.json(
            { success: false, error: 'Ya hay un cierre en curso; espera a que termine.' },
            { status: 409 }
        );
    }
    const limite = cronLimiter.check('cierre-inventario');
    if (!limite.allowed) {
        return NextResponse.json(
            { success: false, error: 'Se generó un cierre hace muy poco; inténtalo en un minuto.' },
            { status: 429 }
        );
    }

    try {
        const sucursales = parseSucursales(new URL(req.url).searchParams.get('sucursales'));
        const data = await generarCierre({ sucursales });
        const fallidas = data.sucursales.filter(s => !s.ok).length;
        return NextResponse.json({ success: true, data, fallidas });
    } catch (error: unknown) {
        console.error('Error al generar el cierre de inventario:', error);
        return NextResponse.json(
            { success: false, error: 'No se pudo generar el cierre de inventario. Revisa el registro del servidor.' },
            { status: 500 }
        );
    }
}
