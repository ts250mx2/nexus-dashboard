/**
 * Cliente de HL Console (hl-servidor): de ahí salen el proveedor y el modelo
 * del agente de IA, y por ahí pasan TODAS las llamadas al proveedor. Del .env
 * solo se leen los datos para hablar con HL:
 *   HL_URL     = http://localhost:3055  (sin diagonal final; HL sirve HTTP plano)
 *   HL_API_KEY = hl_ + 48 hex           (key de acceso de esta app)
 *   HL_AGENTE  = UUID del agente que atiende al dashboard
 *   HL_TTL_MIN = 30                     (opcional, minutos de cache)
 *
 * MODO PROXY: esta aplicación nunca recibe la llave del proveedor. El SDK
 * oficial apunta a `/api/ws/proxy/<uuid>` (configProxy) y HL inyecta la llave y
 * fija el modelo del agente. Por eso aquí no hace falta HL_SECRET ni se descifra
 * nada: de `/api/ws/llave` solo se toman proveedor y modelo, para saber qué SDK
 * usar y qué mostrar en la interfaz.
 *
 * Copia adaptada de kyk-dashboard/src/lib/hl-cliente.ts (a su vez de
 * kyk-server-web, vidaurri-ia y hl-servidor/cliente/hl-cliente.ts). Aquí hay un
 * solo agente, así que el cache es una sola entrada.
 *
 * Si HL no está configurado (falta HL_URL, la key o el UUID), los módulos que lo
 * usan caen al comportamiento previo: llaves y modelos del .env (lib/anthropic.ts,
 * lib/ai.ts). Si cambias el modelo o rotas la llave en el portal, se toma al
 * vencer el cache (HL_TTL_MIN) o al llamar limpiarCacheAgente().
 *
 * Solo del lado servidor: nunca importarlo desde código que llegue al navegador.
 */

/** Con qué SDK se habla el proveedor, según HL. */
export type ApiIA = 'anthropic' | 'openai' | 'gemini';

/** Lo que HL sabe del agente. La llave NO viene aquí: va por el proxy. */
export interface AgenteIA {
    uuid: string;
    /** Nombre del agente en el portal ("Nexus Dashboard"). */
    nombre: string;
    proveedor: 'claude' | 'openai' | 'gemini' | 'otro' | string;
    /** API (SDK) que habla el proveedor; HL lo manda desde 2026-09. Sin él, el adaptador deduce por el nombre. */
    api?: ApiIA | null;
    modelo: string;
    caducidad: string | null;
}

export interface HlClienteConfig {
    url: string;
    key: string;
    /** UUID del agente en HL. */
    agente: string;
    /** Minutos que se conserva la respuesta en memoria. */
    ttlMinutos: number;
    /** Milisegundos máximos de espera por respuesta. */
    timeoutMs: number;
}

/** Variables de entorno que importan aquí (process.env o un doble en pruebas). */
export type EntornoHl = Record<string, string | undefined>;

export interface OpcionesAgente {
    /** Ignora el cache y vuelve a preguntar a HL. */
    forzar?: boolean;
    env?: EntornoHl;
    /** fetch a usar (inyectable en pruebas). */
    fetch?: typeof fetch;
    /** Reloj en milisegundos (inyectable en pruebas). */
    ahora?: () => number;
}

export class HlClienteError extends Error {
    /** Código HTTP con que contestó HL; null si ni siquiera contestó. */
    readonly status: number | null;

    constructor(message: string, status: number | null = null) {
        super(message);
        this.name = 'HlClienteError';
        this.status = status;
    }
}

const DEFAULT_TTL_MINUTOS = 30;
const DEFAULT_TIMEOUT_MS = 10_000;
const MS_POR_MINUTO = 60_000;
const KEY_FORMAT = /^hl_[0-9a-f]{48}$/;
const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function leerConfigHl(env: EntornoHl = process.env): HlClienteConfig {
    const url = (env.HL_URL ?? '').trim().replace(/\/+$/, '');
    const key = (env.HL_API_KEY ?? '').trim();
    const uuid = (env.HL_AGENTE ?? '').trim();
    const ttl = Number(env.HL_TTL_MIN);

    if (!url) throw new HlClienteError('Falta HL_URL en el entorno');
    if (!KEY_FORMAT.test(key)) throw new HlClienteError('HL_API_KEY ausente o con formato inválido (hl_ + 48 hex)');
    if (!UUID_FORMAT.test(uuid)) throw new HlClienteError('HL_AGENTE ausente o no es un UUID válido');

    return {
        url,
        key,
        agente: uuid,
        ttlMinutos: Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TTL_MINUTOS,
        timeoutMs: DEFAULT_TIMEOUT_MS,
    };
}

/** SDK con el que se corre el proveedor que manda HL. */
export type ProveedorSdk = 'anthropic' | 'openai';

/** Proveedores que hablan el API de OpenAI: se corren con el SDK de OpenAI. */
const COMPATIBLES_OPENAI = new Set(['openai', 'deepseek', 'groq', 'mistral', 'xai', 'openrouter', 'kimi', 'qwen', 'glm']);

/**
 * Con qué SDK se corre el proveedor que manda HL. Manda el campo `api` de HL
 * (anthropic | openai | gemini); si HL es anterior y no lo trae, se deduce del
 * nombre. null para gemini u otro que esta app no sabe correr.
 */
export function sdkDeProveedor(proveedor: string, api?: ApiIA | null): ProveedorSdk | null {
    if (api === 'anthropic') return 'anthropic';
    if (api === 'openai') return 'openai';
    if (api) return null;
    const limpio = proveedor.trim().toLowerCase();
    if (limpio === 'claude' || limpio === 'anthropic') return 'anthropic';
    return COMPATIBLES_OPENAI.has(limpio) ? 'openai' : null;
}

/** ¿Están HL_URL, HL_API_KEY y el UUID del agente? Sin eso ni se le pregunta a HL. */
export function hlConfigurado(env: EntornoHl = process.env): boolean {
    try {
        leerConfigHl(env);
        return true;
    } catch {
        return false;
    }
}

export interface ConfigProxy {
    /** baseURL para el SDK del proveedor; al de OpenAI hay que agregarle /v1. */
    baseURL: string;
    headers: Record<string, string>;
}

/**
 * Cómo apuntar el SDK oficial al proxy de HL. La llave que pide el SDK es de
 * mentiras ("hl"): HL la sustituye por la real del agente, igual que el modelo.
 */
export function configProxy(env: EntornoHl = process.env): ConfigProxy {
    const config = leerConfigHl(env);
    return {
        baseURL: `${config.url}/api/ws/proxy/${config.agente}`,
        headers: { 'X-HL-Key': config.key },
    };
}

function esTexto(valor: unknown): valor is string {
    return typeof valor === 'string' && valor.trim() !== '';
}

function esApi(valor: unknown): valor is ApiIA {
    return valor === 'anthropic' || valor === 'openai' || valor === 'gemini';
}

/**
 * Lo que manda HL no se confía sin revisar su forma. La llave no se mira
 * siquiera: en modo proxy no sale del servidor de HL.
 */
function validarAgente(data: unknown): AgenteIA | null {
    if (typeof data !== 'object' || data === null) return null;
    const d = data as Record<string, unknown>;
    if (!esTexto(d.proveedor) || !esTexto(d.modelo)) return null;
    return {
        uuid: typeof d.uuid === 'string' ? d.uuid : '',
        nombre: typeof d.agente === 'string' ? d.agente : '',
        proveedor: d.proveedor.trim().toLowerCase(),
        api: esApi(d.api) ? d.api : undefined,
        modelo: d.modelo.trim(),
        caducidad: typeof d.caducidad === 'string' ? d.caducidad : null,
    };
}

/**
 * "fetch failed" solo dice que no hubo respuesta: el motivo real (ECONNREFUSED,
 * ENOTFOUND, un https:// contra un puerto que habla http…) viene en `cause`.
 */
function detalleDeRed(error: unknown, url: string): string {
    if (!(error instanceof Error)) return 'error de red';
    const causa = error.cause;
    if (!(causa instanceof Error)) return error.message;
    const codigo = (causa as { code?: unknown }).code;
    const detalle = `${error.message} (${typeof codigo === 'string' ? `${codigo}: ` : ''}${causa.message})`;
    // El tropiezo más común al configurar: HL sirve HTTP plano.
    if (url.startsWith('https://') && /ssl|tls|wrong version|certificate|EPROTO/i.test(causa.message)) {
        return `${detalle}. HL Console sirve HTTP plano: si no está detrás de un proxy con certificado, usa http:// en HL_URL`;
    }
    return detalle;
}

async function consultarWs(config: HlClienteConfig, pedir: typeof fetch): Promise<AgenteIA> {
    const url = `${config.url}/api/ws/llave/${config.agente}`;
    let response: Response;
    try {
        response = await pedir(url, {
            headers: { 'X-HL-Key': config.key, Accept: 'application/json' },
            signal: AbortSignal.timeout(config.timeoutMs),
            cache: 'no-store',
        });
    } catch (error) {
        throw new HlClienteError(`No se pudo conectar con HL Console (${url}): ${detalleDeRed(error, config.url)}`);
    }

    let body: { success?: unknown; data?: unknown; error?: unknown };
    try {
        body = (await response.json()) as typeof body;
    } catch {
        throw new HlClienteError(`HL Console respondió ${response.status} sin JSON válido`, response.status);
    }

    if (!response.ok || body.success !== true) {
        const mensaje = esTexto(body.error) ? body.error : `HL Console respondió ${response.status}`;
        throw new HlClienteError(mensaje, response.status);
    }
    const agente = validarAgente(body.data);
    if (!agente) throw new HlClienteError('HL Console respondió sin proveedor o sin modelo', response.status);
    return agente;
}

interface EntradaCache {
    valor: AgenteIA;
    expira: number;
}

let cache: EntradaCache | null = null;
let enCurso: Promise<AgenteIA> | null = null;

/**
 * Proveedor y modelo del agente, según HL. Cachea en memoria durante HL_TTL_MIN
 * minutos y junta las peticiones simultáneas en una sola. Si el refresco falla y
 * hay un valor previo, lo reutiliza para no dejar mudo al agente mientras HL vuelve.
 */
export async function obtenerAgente(opciones: OpcionesAgente = {}): Promise<AgenteIA> {
    const config = leerConfigHl(opciones.env ?? process.env);
    const ahora = opciones.ahora ?? Date.now;

    if (!opciones.forzar && cache && cache.expira > ahora()) return cache.valor;
    if (enCurso) return enCurso;

    enCurso = consultarWs(config, opciones.fetch ?? fetch)
        .then(valor => {
            cache = { valor, expira: ahora() + config.ttlMinutos * MS_POR_MINUTO };
            return valor;
        })
        .catch((error: unknown) => {
            if (cache) {
                console.error('[hl] falló el refresco del agente; se reutiliza lo anterior.', error);
                return cache.valor;
            }
            throw error;
        })
        .finally(() => {
            enCurso = null;
        });
    return enCurso;
}

/** Descarta el cache. Útil tras cambiar el modelo o la llave en el portal. */
export function limpiarCacheAgente(): void {
    cache = null;
}
