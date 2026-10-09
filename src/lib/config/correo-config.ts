/**
 * Configuración de correo del portal, editable desde Configuración → Correo:
 * servidor SMTP de salida, destinatarios generales del cierre de inventario y
 * destinatarios por sucursal. Vive en el esquema propio del portal (BDNexusWeb).
 *
 * La contraseña del SMTP se guarda cifrada (secret-box) y nunca sale del
 * servidor. Si la pantalla no tiene SMTP capturado, se usan las variables
 * SMTP_* y CIERRE_EMAIL_TO del entorno.
 */

import type { RowDataPacket } from 'mysql2/promise';
import { normalizarCorreos } from '@/lib/correos';
import { getPool } from '@/lib/db';
import { ESQUEMA, ensureCierresSchema } from '@/lib/inventory/cierres';
import { listarSucursalesInventario } from '@/lib/inventory/sucursales';
import { cifrar, descifrar } from '@/lib/secret-box';

const T_CONFIG = `${ESQUEMA}.portal_config`;
const T_DESTINOS = `${ESQUEMA}.cierre_destinatarios`;

const DDL = [
    `CREATE TABLE IF NOT EXISTS ${T_CONFIG} (
        Clave          VARCHAR(60)  NOT NULL PRIMARY KEY,
        Valor          TEXT         NULL,
        ActualizadoEn  DATETIME     NOT NULL,
        ActualizadoPor VARCHAR(60)  NULL
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS ${T_DESTINOS} (
        IdSucursal     INT          NOT NULL PRIMARY KEY,
        Correos        TEXT         NOT NULL,
        ActualizadoEn  DATETIME     NOT NULL,
        ActualizadoPor VARCHAR(60)  NULL
    ) ENGINE=InnoDB`,
];

const CLAVES = {
    host: 'smtp.host',
    port: 'smtp.port',
    user: 'smtp.user',
    pass: 'smtp.pass',
    from: 'smtp.from',
    general: 'cierres.correos_generales',
} as const;

let listo: Promise<void> | null = null;

function ensureConfigSchema(): Promise<void> {
    if (!listo) {
        listo = (async () => {
            await ensureCierresSchema();
            const pool = await getPool();
            for (const sentencia of DDL) await pool.query(sentencia);
        })().catch(err => {
            listo = null;
            throw err;
        });
    }
    return listo;
}

async function leerClaves(): Promise<Map<string, string>> {
    await ensureConfigSchema();
    const pool = await getPool();
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT Clave, Valor FROM ${T_CONFIG}`);
    return new Map(rows.map(r => [String(r.Clave), String(r.Valor ?? '')]));
}

export interface SmtpConfig {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
}

/** Error de validación que depende de lo ya guardado; la ruta lo devuelve como 400. */
export class ConfigInvalida extends Error {}

function descifrarPassword(sobre: string): string {
    try {
        return descifrar(sobre);
    } catch {
        throw new Error('La contraseña SMTP guardada no se puede descifrar (¿cambió CONFIG_SECRET?). Vuelve a capturarla en Configuración → Correo.');
    }
}

export type OrigenSmtp = 'pantalla' | 'entorno' | 'ninguno';

/** Configuración SMTP efectiva (con contraseña): la de la pantalla o, si no hay, la del entorno. */
export async function cargarSmtp(): Promise<{ config: SmtpConfig | null; origen: OrigenSmtp }> {
    const c = await leerClaves();
    const host = c.get(CLAVES.host);
    if (host) {
        const sobre = c.get(CLAVES.pass);
        return {
            origen: 'pantalla',
            config: {
                host,
                port: Number(c.get(CLAVES.port)) || 587,
                user: c.get(CLAVES.user) ?? '',
                pass: sobre ? descifrarPassword(sobre) : '',
                from: c.get(CLAVES.from) ?? '',
            },
        };
    }
    const env = process.env;
    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
        return {
            origen: 'entorno',
            config: { host: env.SMTP_HOST, port: Number(env.SMTP_PORT) || 587, user: env.SMTP_USER, pass: env.SMTP_PASS, from: env.SMTP_FROM ?? '' },
        };
    }
    return { config: null, origen: 'ninguno' };
}

export interface DestinatariosCierre {
    /** Reciben el Excel completo de todas las sucursales. */
    general: string;
    /** IdSucursal → correos que reciben solo su sucursal. */
    porSucursal: Map<number, string>;
}

export async function cargarDestinatarios(): Promise<DestinatariosCierre> {
    const c = await leerClaves();
    const pool = await getPool();
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT IdSucursal, Correos FROM ${T_DESTINOS}`);
    return {
        general: c.has(CLAVES.general) ? c.get(CLAVES.general) ?? '' : process.env.CIERRE_EMAIL_TO ?? '',
        porSucursal: new Map(rows.map(r => [Number(r.IdSucursal), String(r.Correos ?? '')])),
    };
}

/** Lo que ve la pantalla: todo menos la contraseña. */
export interface ConfigCorreoVista {
    smtp: { host: string; port: number; user: string; from: string; tienePassword: boolean; origen: OrigenSmtp };
    general: string;
    sucursales: { IdSucursal: number; Sucursal: string; correos: string }[];
}

export async function leerConfigVista(): Promise<ConfigCorreoVista> {
    const [c, destinos, sucursales] = await Promise.all([leerClaves(), cargarDestinatarios(), listarSucursalesInventario()]);
    const enPantalla = Boolean(c.get(CLAVES.host));
    const env = process.env;
    return {
        smtp: enPantalla
            ? {
                host: c.get(CLAVES.host) ?? '',
                port: Number(c.get(CLAVES.port)) || 587,
                user: c.get(CLAVES.user) ?? '',
                from: c.get(CLAVES.from) ?? '',
                tienePassword: Boolean(c.get(CLAVES.pass)),
                origen: 'pantalla',
            }
            : {
                host: env.SMTP_HOST ?? '',
                port: Number(env.SMTP_PORT) || 587,
                user: env.SMTP_USER ?? '',
                from: env.SMTP_FROM ?? '',
                tienePassword: Boolean(env.SMTP_PASS),
                origen: env.SMTP_HOST ? 'entorno' : 'ninguno',
            },
        general: destinos.general,
        sucursales: sucursales.map(s => ({ ...s, correos: destinos.porSucursal.get(s.IdSucursal) ?? '' })),
    };
}

export interface ConfigCorreoEntrada {
    smtp: { host: string; port: number; user: string; from: string; /** Vacío = conservar la actual. */ pass?: string };
    general: string;
    sucursales: { IdSucursal: number; correos: string }[];
}

/**
 * Guarda todo en una transacción. La contraseña solo se reemplaza si viene una
 * nueva; pero si cambia el servidor, el puerto o el usuario hay que volver a
 * escribirla: si no, quien edite la pantalla podría apuntar el SMTP a un
 * servidor suyo y el portal le entregaría la contraseña guardada al autenticarse.
 */
export async function guardarConfig(entrada: ConfigCorreoEntrada, usuario: string): Promise<void> {
    const actual = await leerClaves();
    const conPassGuardada = Boolean(actual.get(CLAVES.pass));
    const cambiaDestino =
        entrada.smtp.host !== (actual.get(CLAVES.host) ?? '') ||
        String(entrada.smtp.port) !== (actual.get(CLAVES.port) ?? String(entrada.smtp.port)) ||
        entrada.smtp.user !== (actual.get(CLAVES.user) ?? '');
    if (conPassGuardada && cambiaDestino && entrada.smtp.host && !entrada.smtp.pass) {
        throw new ConfigInvalida('Cambiaste el servidor, el puerto o el usuario: vuelve a escribir la contraseña.');
    }

    const pool = await getPool();
    const conn = await pool.getConnection();
    const ahora = new Date();
    const valores: [string, string][] = [
        [CLAVES.host, entrada.smtp.host],
        [CLAVES.port, String(entrada.smtp.port)],
        [CLAVES.user, entrada.smtp.user],
        [CLAVES.from, entrada.smtp.from],
        [CLAVES.general, normalizarCorreos(entrada.general)],
    ];
    if (entrada.smtp.pass) valores.push([CLAVES.pass, cifrar(entrada.smtp.pass)]);

    try {
        await conn.beginTransaction();
        for (const [clave, valor] of valores) {
            await conn.query(
                `INSERT INTO ${T_CONFIG} (Clave, Valor, ActualizadoEn, ActualizadoPor) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE Valor = VALUES(Valor), ActualizadoEn = VALUES(ActualizadoEn), ActualizadoPor = VALUES(ActualizadoPor)`,
                [clave, valor, ahora, usuario]
            );
        }
        // Sucursales que ya no están en el catálogo: sus correos no deben quedar huérfanos.
        const ids = entrada.sucursales.map(x => x.IdSucursal);
        if (ids.length > 0) await conn.query(`DELETE FROM ${T_DESTINOS} WHERE IdSucursal NOT IN (?)`, [ids]);
        for (const s of entrada.sucursales) {
            const correos = normalizarCorreos(s.correos);
            if (correos) {
                await conn.query(
                    `INSERT INTO ${T_DESTINOS} (IdSucursal, Correos, ActualizadoEn, ActualizadoPor) VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE Correos = VALUES(Correos), ActualizadoEn = VALUES(ActualizadoEn), ActualizadoPor = VALUES(ActualizadoPor)`,
                    [s.IdSucursal, correos, ahora, usuario]
                );
            } else {
                await conn.query(`DELETE FROM ${T_DESTINOS} WHERE IdSucursal = ?`, [s.IdSucursal]);
            }
        }
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}
