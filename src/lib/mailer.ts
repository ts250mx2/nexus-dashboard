import nodemailer from 'nodemailer';
import type { SmtpConfig } from '@/lib/config/correo-config';

/**
 * Envío de correo por SMTP. La configuración la da quien llama (ver
 * cargarSmtp en config/correo-config): no se cachea el transporte para que un
 * cambio hecho en la pantalla de Configuración aplique en el siguiente envío.
 */

export interface Adjunto {
    filename: string;
    content: Buffer;
    contentType?: string;
}

export interface Correo {
    to: string[];
    subject: string;
    html: string;
    attachments?: Adjunto[];
}

const TIMEOUT_MS = 20_000;
/** Puerto 25 = relevo local sin cifrado; en cualquier otro (salvo 465, que ya es SSL) se exige STARTTLS. */
const PUERTO_RELEVO = 25;

function transporte(smtp: SmtpConfig) {
    return nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        requireTLS: smtp.port !== 465 && smtp.port !== PUERTO_RELEVO,
        auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
        connectionTimeout: TIMEOUT_MS,
        greetingTimeout: TIMEOUT_MS,
        socketTimeout: TIMEOUT_MS * 3,
    });
}

export async function enviarCorreo(smtp: SmtpConfig, correo: Correo): Promise<void> {
    if (correo.to.length === 0) throw new Error('No hay destinatarios.');
    await transporte(smtp).sendMail({
        from: smtp.from || smtp.user,
        to: correo.to.join(', '),
        subject: correo.subject,
        html: correo.html,
        attachments: correo.attachments,
    });
}

/** Comprueba conexión y credenciales sin mandar nada. */
export async function verificarSmtp(smtp: SmtpConfig): Promise<void> {
    await transporte(smtp).verify();
}

/**
 * Mensaje para la pantalla a partir de un error de nodemailer, sin el texto
 * crudo del servidor (banners, direcciones internas). El detalle va al log.
 */
export function mensajeErrorSmtp(err: unknown): string {
    const code = (err as { code?: unknown })?.code;
    if (code === 'EAUTH') return 'El servidor rechazó el usuario o la contraseña.';
    if (code === 'ETLS') return 'No se pudo establecer una conexión cifrada (TLS) con el servidor.';
    if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'EDNS') {
        return 'No se pudo conectar con el servidor SMTP. Revisa el servidor y el puerto.';
    }
    if (code === 'EENVELOPE') return 'El servidor rechazó el remitente o el destinatario.';
    if (err instanceof Error && /CONFIG_SECRET|descifrar/.test(err.message)) return err.message;
    return 'El servidor SMTP rechazó el envío. Revisa la configuración.';
}

export function escaparHtml(texto: string): string {
    return texto
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
