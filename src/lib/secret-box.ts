import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Cifrado simétrico (AES-256-GCM) para secretos que el portal guarda en la base,
 * como la contraseña del SMTP. La llave sale de CONFIG_SECRET (o JWT_SECRET si
 * no está definida). Si se cambia esa variable, los secretos guardados ya no se
 * pueden leer y hay que volver a capturarlos.
 *
 * Formato: "v1:<iv>:<tag>:<cifrado>" en base64url.
 */

const PREFIJO = 'v1';

function llave(secreto: string | undefined): Buffer {
    if (!secreto || secreto.length < 16) {
        throw new Error('Falta CONFIG_SECRET (o JWT_SECRET) de al menos 16 caracteres para cifrar secretos.');
    }
    return createHash('sha256').update(secreto).digest();
}

function secretoDelEntorno(): string | undefined {
    return process.env.CONFIG_SECRET || process.env.JWT_SECRET;
}

export function cifrar(texto: string, secreto = secretoDelEntorno()): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', llave(secreto), iv);
    const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
    return [PREFIJO, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), cifrado.toString('base64url')].join(':');
}

export function descifrar(sobre: string, secreto = secretoDelEntorno()): string {
    const [prefijo, iv, tag, cifrado] = sobre.split(':');
    if (prefijo !== PREFIJO || !iv || !tag || cifrado === undefined) throw new Error('Secreto con formato inválido.');
    const decipher = createDecipheriv('aes-256-gcm', llave(secreto), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(cifrado, 'base64url')), decipher.final()]).toString('utf8');
}
