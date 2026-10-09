import { NextRequest, NextResponse } from 'next/server';
import { accesoAdmin } from '@/lib/admin-auth';
import { cargarSmtp } from '@/lib/config/correo-config';
import { parseDestinatarios } from '@/lib/correos';
import { enviarCorreo, escaparHtml, mensajeErrorSmtp, verificarSmtp } from '@/lib/mailer';
import { configLimiter } from '@/lib/rate-limit';

/**
 * PRUEBA DE CORREO: con la configuración GUARDADA, verifica la conexión SMTP y
 * manda un correo de prueba a `to` (un solo destinatario).
 */

export const maxDuration = 60;

export async function POST(req: NextRequest) {
    const acceso = await accesoAdmin();
    if (!acceso.ok) return NextResponse.json({ success: false, error: acceso.error }, { status: acceso.status });
    if (!configLimiter.check(`prueba:${acceso.usuario}`).allowed) {
        return NextResponse.json({ success: false, error: 'Demasiadas pruebas seguidas; espera un minuto.' }, { status: 429 });
    }

    const body = (await req.json().catch(() => null)) as { to?: unknown } | null;
    const to = parseDestinatarios(typeof body?.to === 'string' ? body.to : '');
    if (to.length !== 1) {
        return NextResponse.json({ success: false, error: 'Escribe un solo correo válido para la prueba.' }, { status: 400 });
    }

    try {
        const { config, origen } = await cargarSmtp();
        if (!config) return NextResponse.json({ success: false, error: 'Primero guarda la configuración del SMTP.' }, { status: 400 });

        await verificarSmtp(config);
        await enviarCorreo(config, {
            to,
            subject: 'Prueba de correo · Nexus',
            html: `<p style="font-family:Arial,sans-serif">Este es un correo de prueba enviado desde el portal Nexus por
                   <b>${escaparHtml(acceso.usuario)}</b> con la configuración SMTP de ${origen === 'pantalla' ? 'la pantalla de Configuración' : 'las variables de entorno'}
                   (${escaparHtml(config.host)}:${config.port}).</p>`,
        });
        return NextResponse.json({ success: true, data: { origen } });
    } catch (error: unknown) {
        console.error('Prueba de correo fallida:', error);
        return NextResponse.json({ success: false, error: `No se pudo enviar: ${mensajeErrorSmtp(error)}` }, { status: 502 });
    }
}
