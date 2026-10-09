/**
 * Listas de correos escritas a mano ("a@x.com, b@y.com; c@z.com") y validación
 * del formulario de Configuración → Correo. Lógica pura: sin base ni red.
 */

import type { ConfigCorreoEntrada } from './config/correo-config';

const CORREO = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
/** Tope por lista: evita que un campo se convierta en envío masivo. */
export const MAX_CORREOS_POR_LISTA = 20;

export interface ListaCorreos {
    validos: string[];
    invalidos: string[];
}

/** Separa por coma, punto y coma o salto de línea; quita duplicados (sin distinguir mayúsculas). */
export function analizarCorreos(raw: string | null | undefined): ListaCorreos {
    const vistos = new Set<string>();
    const validos: string[] = [];
    const invalidos: string[] = [];
    for (const parte of (raw ?? '').split(/[,;\n]/)) {
        const correo = parte.trim();
        if (!correo) continue;
        if (!CORREO.test(correo) || correo.length > 254) {
            invalidos.push(correo);
            continue;
        }
        const clave = correo.toLowerCase();
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        validos.push(correo);
    }
    return { validos, invalidos };
}

/** Solo los correos válidos. */
export function parseDestinatarios(raw: string | null | undefined): string[] {
    return analizarCorreos(raw).validos;
}

/** Forma canónica para guardar: válidos separados por ", ". */
export function normalizarCorreos(raw: string | null | undefined): string {
    return analizarCorreos(raw).validos.join(', ');
}

export type Validacion = { ok: true; data: ConfigCorreoEntrada } | { ok: false; error: string };

const HOST = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
const MAX_TEXTO = 254;
const MAX_PASS = 500;

/** Remitente: "correo" o "Nombre <correo>". */
export function remitenteValido(from: string): boolean {
    const m = /^(?:"?([^"<>\r\n]{1,100})"?\s*)?<([^<>\s]+)>$/.exec(from);
    return CORREO.test(m ? m[2] : from);
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function validarLista(raw: string, etiqueta: string): string | null {
    const { validos, invalidos } = analizarCorreos(raw);
    if (invalidos.length > 0) return `${etiqueta}: no parece${invalidos.length > 1 ? 'n' : ''} correo ${invalidos.slice(0, 3).join(', ')}`;
    if (validos.length > MAX_CORREOS_POR_LISTA) return `${etiqueta}: máximo ${MAX_CORREOS_POR_LISTA} correos.`;
    return null;
}

export function validarConfigCorreo(body: unknown, sucursales: Map<number, string>): Validacion {
    if (!body || typeof body !== 'object') return { ok: false, error: 'Solicitud inválida.' };
    const b = body as Record<string, unknown>;
    const smtpRaw = (b.smtp && typeof b.smtp === 'object' ? b.smtp : {}) as Record<string, unknown>;

    const host = texto(smtpRaw.host);
    const port = Number(smtpRaw.port);
    const user = texto(smtpRaw.user);
    const from = texto(smtpRaw.from);
    const pass = typeof smtpRaw.pass === 'string' ? smtpRaw.pass : '';

    if (host && !HOST.test(host)) return { ok: false, error: 'El servidor SMTP no es un nombre de host válido.' };
    if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, error: 'El puerto debe ser un número entre 1 y 65535.' };
    if (user.length > MAX_TEXTO || from.length > MAX_TEXTO) return { ok: false, error: 'Usuario o remitente demasiado largo.' };
    if (/[\r\n]/.test(from) || /[\r\n]/.test(user)) return { ok: false, error: 'Usuario o remitente con saltos de línea.' };
    if (from && !remitenteValido(from)) return { ok: false, error: 'El remitente debe ser un correo o «Nombre <correo>».' };
    if (pass.length > MAX_PASS) return { ok: false, error: 'Contraseña demasiado larga.' };

    const general = texto(b.general);
    const errGeneral = validarLista(general, 'Correos generales');
    if (errGeneral) return { ok: false, error: errGeneral };

    if (!Array.isArray(b.sucursales)) return { ok: false, error: 'Falta la lista de sucursales.' };
    const vistas = new Set<number>();
    const lista: ConfigCorreoEntrada['sucursales'] = [];
    for (const item of b.sucursales as unknown[]) {
        const s = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        const id = Number(s.IdSucursal);
        const nombre = sucursales.get(id);
        if (!nombre || vistas.has(id)) return { ok: false, error: 'Sucursal desconocida o repetida.' };
        vistas.add(id);
        const correos = texto(s.correos);
        const err = validarLista(correos, nombre);
        if (err) return { ok: false, error: err };
        lista.push({ IdSucursal: id, correos });
    }

    return { ok: true, data: { smtp: { host, port, user, from, pass }, general, sucursales: lista } };
}
