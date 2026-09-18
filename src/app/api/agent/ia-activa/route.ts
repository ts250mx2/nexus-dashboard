import { NextResponse } from 'next/server';
import { iaActiva } from '@/lib/hl-agentes';

/**
 * GET /api/agent/ia-activa
 *
 * Qué IA está atendiendo al agente en este momento, según HL Console. La
 * interfaz lo pide al abrir el chat para no anunciar un modelo inventado: si
 * cambias el agente o el modelo en el portal, aquí se ve en cuanto vence el
 * cache (HL_TTL_MIN).
 *
 * Devuelve `{ ia: null }` cuando HL no está configurado o no contesta; en ese
 * caso la app corre con las llaves del .env y la interfaz no promete un modelo.
 */
export async function GET() {
    const ia = await iaActiva();
    return NextResponse.json({ ia }, {
        headers: { 'Cache-Control': 'no-store' },
    });
}
