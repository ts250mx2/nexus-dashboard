import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';

/**
 * Autorización de los endpoints de cierres de inventario: una sesión del portal
 * (pantalla) o el encabezado `x-cierre-token` igual a CIERRE_TOKEN (tarea
 * programada). Sin CIERRE_TOKEN configurado, el token nunca autoriza.
 */

export const ENCABEZADO_TOKEN = 'x-cierre-token';

function tokenValido(enviado: string | null): boolean {
    const esperado = process.env.CIERRE_TOKEN;
    if (!esperado || !enviado) return false;
    const a = Buffer.from(enviado);
    const b = Buffer.from(esperado);
    return a.length === b.length && timingSafeEqual(a, b);
}

export async function autorizadoCierres(req: NextRequest): Promise<boolean> {
    if (tokenValido(req.headers.get(ENCABEZADO_TOKEN))) return true;
    const session = await getSession().catch(() => null);
    return session !== null;
}
