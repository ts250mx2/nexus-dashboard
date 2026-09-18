import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import {
    HlClienteError,
    configProxy,
    hlConfigurado,
    obtenerAgente,
    sdkDeProveedor,
    type ProveedorSdk,
} from './hl-cliente';

export { sdkDeProveedor, type ProveedorSdk } from './hl-cliente';

/**
 * Adaptador del agente de HL Console para esta app (mismo patrón que
 * kyk-dashboard, kyk-server-web y vidaurri-ia): de HL salen el proveedor y el
 * modelo, y las llamadas van por su PROXY con el SDK oficial. Esta app nunca
 * tiene en memoria una llave de Anthropic ni de OpenAI cuando HL está activo.
 *
 * Todo lo que consulta IA pasa por aquí: /api/query (chat), los reportes
 * avanzados, los análisis de página y los ayudantes internos (razonador causal,
 * investigador, prompts proactivos).
 *
 * Si HL no está configurado o no contesta, los módulos que lo usan caen al
 * comportamiento previo (llaves y modelos del .env) y lo anotan en el log.
 */

/** Lo que se muestra en la interfaz sobre qué IA contestó. */
export interface IAUsada {
    proveedor: string;
    modelo: string;
    /** Nombre del agente en el portal de HL. */
    agente: string;
    sdk: ProveedorSdk;
}

export interface CredencialHl {
    /** Con qué SDK se habla ("anthropic" o "openai"). */
    sdk: ProveedorSdk;
    /** Nombre del proveedor en HL ("claude", "openai", "glm", "kimi"…). */
    proveedor: string;
    modelo: string;
    /** Nombre del agente en el portal de HL. */
    nombre: string;
    /** Entrada del proxy de HL; la llave del proveedor no llega aquí. */
    baseURL: string;
    headers: Record<string, string>;
}

/** El SDK exige una llave; la real la pone HL en el proxy. */
const LLAVE_DE_PASO = 'hl';

/** Margen para análisis largos; mismo default que los clientes del .env. */
const TIMEOUT_MS = Number(process.env.ANTHROPIC_TIMEOUT_MS) || 1_800_000;

/**
 * Proveedor, modelo y entrada al proxy con que corre el agente, según HL. Sube
 * un HlClienteError si HL no está configurado, no contesta (y no hay nada previo
 * en cache) o asigna un proveedor que aquí no se sabe correr.
 */
export async function credencialDeAgente(): Promise<CredencialHl> {
    const info = await obtenerAgente();
    const sdk = sdkDeProveedor(info.proveedor, info.api);
    if (!sdk) {
        throw new HlClienteError(
            `HL asignó al agente el proveedor "${info.proveedor}", que este sistema no sabe correr (solo los que hablan el API de Anthropic o de OpenAI)`
        );
    }
    return {
        sdk,
        proveedor: info.proveedor.trim().toLowerCase(),
        modelo: info.modelo,
        nombre: info.nombre,
        ...configProxy(),
    };
}

/**
 * La credencial del agente o null si HL no está configurado o no dio credencial.
 * El motivo queda en el log; quien llama decide el respaldo (normalmente, las
 * llaves del .env).
 */
export async function credencialOpcional(): Promise<CredencialHl | null> {
    if (!hlConfigurado()) return null;
    try {
        return await credencialDeAgente();
    } catch (error) {
        console.error('[hl] sin credencial para el agente; se usan las llaves del .env:', error);
        return null;
    }
}

/** SDK de Anthropic apuntando al proxy de HL (la llave real la pone HL). */
export function clienteAnthropicHl(cred: CredencialHl): Anthropic {
    return new Anthropic({
        baseURL: cred.baseURL,
        apiKey: LLAVE_DE_PASO,
        defaultHeaders: cred.headers,
        timeout: TIMEOUT_MS,
    });
}

/** SDK de OpenAI apuntando al proxy de HL. El SDK cuelga las rutas de la baseURL, así que lleva /v1. */
export function clienteOpenAIHl(cred: CredencialHl): OpenAI {
    return new OpenAI({
        baseURL: `${cred.baseURL}/v1`,
        apiKey: LLAVE_DE_PASO,
        defaultHeaders: cred.headers,
        timeout: TIMEOUT_MS,
    });
}

/** Lo que se muestra en la interfaz de una credencial. */
export function iaDeCredencial(cred: CredencialHl): IAUsada {
    return { proveedor: cred.proveedor, modelo: cred.modelo, agente: cred.nombre, sdk: cred.sdk };
}

/**
 * Qué IA está activa, para que la interfaz la muestre antes de la primera
 * pregunta. null si HL no está configurado o no contesta.
 */
export async function iaActiva(): Promise<IAUsada | null> {
    const cred = await credencialOpcional();
    return cred ? iaDeCredencial(cred) : null;
}
