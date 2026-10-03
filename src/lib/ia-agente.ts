import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { anthropic, anthropicText } from './anthropic';
import { openai } from './ai';
import {
    clienteAnthropicHl,
    clienteOpenAIHl,
    credencialOpcional,
    iaDeCredencial,
    type CredencialHl,
    type IAUsada,
    type ProveedorSdk,
} from './hl-agentes';
import { limpiarCacheAgente } from './hl-cliente';

/**
 * El agente de IA activo, visto como una sola cosa que sabe hablar los dos SDK.
 *
 * Existe para que el chat no tenga que repetir la misma conversación dos veces
 * —una en el API de Anthropic y otra en el de OpenAI— cada vez que hace falta
 * una decisión con herramientas o un texto en streaming. Quien lo use escribe
 * la lógica una vez y aquí se traduce al SDK que toque.
 */

/** Código con el que HL avisa que el agente cambió de proveedor en el portal. */
const PROVEEDOR_CAMBIADO = 'PROVEEDOR_CAMBIADO';

/** Modelos de razonamiento de OpenAI: piden max_completion_tokens en vez de max_tokens. */
const MODELO_RAZONADOR = /^(gpt-5|o\d)/i;

export interface AgenteActivo {
    /** Con qué SDK se habla. */
    sdk: ProveedorSdk;
    /** Modelo que de verdad corre (el de HL cuando está activo). */
    modelo: string;
    /** Qué IA contestó, para la interfaz. null si HL no está disponible. */
    ia: IAUsada | null;
    /** Credencial de HL; null cuando se corre con las llaves del .env. */
    cred: CredencialHl | null;
    anthropic: Anthropic;
    openai: OpenAI;
}

/** Herramienta en el formato de Anthropic; aquí se traduce al de OpenAI cuando toca. */
export interface HerramientaIA {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}

export interface TurnoIA {
    role: 'user' | 'assistant';
    content: string;
}

export interface DecisionIA {
    /** Texto que acompañó a la decisión (puede venir vacío). */
    texto: string;
    /** Herramientas que el modelo pidió usar, en orden. */
    herramientas: { name: string; input: Record<string, unknown> }[];
    tokensEntrada?: number;
    tokensSalida?: number;
}

/**
 * Proveedor, modelo y clientes con que corre ahora el agente. Sin HL se respeta
 * `modeloPorDefecto` y se usan las llaves del .env.
 */
export async function resolverAgente(modeloPorDefecto: string): Promise<AgenteActivo> {
    const cred = await credencialOpcional();
    const sdk: ProveedorSdk = cred
        ? cred.sdk
        : modeloPorDefecto.toLowerCase().includes('claude') ? 'anthropic' : 'openai';

    return {
        sdk,
        modelo: cred ? cred.modelo : modeloPorDefecto,
        ia: cred ? iaDeCredencial(cred) : null,
        cred,
        anthropic: cred ? clienteAnthropicHl(cred) : anthropic,
        openai: cred ? clienteOpenAIHl(cred) : openai,
    };
}

/** Lee un header de un error de SDK, venga como Headers o como objeto plano. */
function headerDeError(headers: unknown, nombre: string): string | null {
    if (!headers) return null;
    if (typeof (headers as Headers).get === 'function') {
        return (headers as Headers).get(nombre);
    }
    if (typeof headers === 'object') {
        const plano = headers as Record<string, unknown>;
        const clave = Object.keys(plano).find(k => k.toLowerCase() === nombre.toLowerCase());
        const valor = clave ? plano[clave] : undefined;
        return typeof valor === 'string' ? valor : null;
    }
    return null;
}

/**
 * ¿Es el 422 con el que HL avisa que el agente cambió de proveedor?
 *
 * Pasa cuando alguien edita el agente en el portal: la app todavía tiene en
 * cache el proveedor anterior y sigue llamando con ese SDK. HL no reenvía esa
 * llamada y responde 422 para que se refresque la credencial.
 */
export function esProveedorCambiado(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const e = error as { status?: unknown; headers?: unknown; message?: unknown; error?: { code?: unknown } };
    if (e.status !== 422) return false;
    if (headerDeError(e.headers, 'x-hl-error') === PROVEEDOR_CAMBIADO) return true;
    if (e.error && e.error.code === PROVEEDOR_CAMBIADO) return true;
    return typeof e.message === 'string' && e.message.includes(PROVEEDOR_CAMBIADO);
}

/**
 * Corre `tarea` con el agente vigente y, si HL avisa que cambió de proveedor,
 * refresca la credencial y la repite una sola vez con el SDK correcto.
 *
 * Devuelve también el agente con el que se completó, para que quien llama siga
 * el resto de la petición con ese y no con el que ya quedó viejo.
 */
export async function ejecutarConAgente<T>(
    modeloPorDefecto: string,
    tarea: (agente: AgenteActivo) => Promise<T>
): Promise<{ agente: AgenteActivo; resultado: T }> {
    const agente = await resolverAgente(modeloPorDefecto);
    try {
        return { agente, resultado: await tarea(agente) };
    } catch (error) {
        if (!agente.cred || !esProveedorCambiado(error)) throw error;
        console.warn('[hl] el agente cambió de proveedor; se refresca la credencial y se reintenta');
        limpiarCacheAgente();
        const fresco = await resolverAgente(modeloPorDefecto);
        return { agente: fresco, resultado: await tarea(fresco) };
    }
}

/** Tope de tokens con el nombre que acepta cada modelo de OpenAI. */
function topeOpenAI(modelo: string, maxTokens: number) {
    return MODELO_RAZONADOR.test(modelo)
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens };
}

/** Los mensajes de la conversación en el formato de OpenAI, con el sistema al frente. */
function mensajesOpenAI(system: string, mensajes: TurnoIA[]) {
    return [
        { role: 'system' as const, content: system },
        ...mensajes.map(m => ({ role: m.role, content: m.content })),
    ];
}

/**
 * Una vuelta de conversación con herramientas disponibles: devuelve el texto y
 * las herramientas que el modelo decidió usar, sin importar el SDK.
 */
export async function decidir(
    agente: AgenteActivo,
    opts: { system: string; mensajes: TurnoIA[]; herramientas: HerramientaIA[]; maxTokens: number }
): Promise<DecisionIA> {
    if (agente.sdk === 'anthropic') {
        const respuesta = await agente.anthropic.messages.create({
            model: agente.modelo,
            max_tokens: opts.maxTokens,
            system: opts.system,
            messages: opts.mensajes,
            tools: opts.herramientas as never,
            tool_choice: { type: 'auto' },
        });
        const bloques = respuesta.content as { type?: string; name?: string; input?: unknown }[];
        return {
            texto: anthropicText(respuesta),
            herramientas: bloques
                .filter(b => b.type === 'tool_use')
                .map(b => ({ name: String(b.name), input: (b.input ?? {}) as Record<string, unknown> })),
            tokensEntrada: respuesta.usage?.input_tokens,
            tokensSalida: respuesta.usage?.output_tokens,
        };
    }

    const respuesta = await agente.openai.chat.completions.create({
        model: agente.modelo,
        ...topeOpenAI(agente.modelo, opts.maxTokens),
        messages: mensajesOpenAI(opts.system, opts.mensajes),
        tools: opts.herramientas.map(h => ({
            type: 'function' as const,
            function: { name: h.name, description: h.description, parameters: h.input_schema },
        })),
        tool_choice: 'auto',
    });

    const mensaje = respuesta.choices[0]?.message;
    return {
        texto: mensaje?.content ?? '',
        herramientas: (mensaje?.tool_calls ?? []).flatMap(llamada => {
            if (llamada.type !== 'function') return [];
            try {
                return [{ name: llamada.function.name, input: JSON.parse(llamada.function.arguments || '{}') }];
            } catch {
                // Un JSON malformado del modelo no debe tumbar la petición completa.
                return [];
            }
        }),
        tokensEntrada: respuesta.usage?.prompt_tokens,
        tokensSalida: respuesta.usage?.completion_tokens,
    };
}

/** Texto de un solo prompt, sin herramientas. Para correcciones y recortes. */
export async function textoUnico(
    agente: AgenteActivo,
    opts: { prompt: string; maxTokens: number }
): Promise<string> {
    if (agente.sdk === 'anthropic') {
        const respuesta = await agente.anthropic.messages.create({
            model: agente.modelo,
            max_tokens: opts.maxTokens,
            messages: [{ role: 'user', content: opts.prompt }],
        });
        return anthropicText(respuesta);
    }

    const respuesta = await agente.openai.chat.completions.create({
        model: agente.modelo,
        ...topeOpenAI(agente.modelo, opts.maxTokens),
        messages: [{ role: 'user', content: opts.prompt }],
    });
    return respuesta.choices[0]?.message?.content ?? '';
}

/**
 * Trozos de texto conforme el modelo los va escribiendo. Es lo que permite que
 * el chat se escriba palabra por palabra con cualquiera de los dos proveedores.
 */
export async function* streamDeTexto(
    agente: AgenteActivo,
    opts: { prompt: string; maxTokens: number }
): AsyncGenerator<string> {
    if (agente.sdk === 'anthropic') {
        const stream = agente.anthropic.messages.stream({
            model: agente.modelo,
            max_tokens: opts.maxTokens,
            messages: [{ role: 'user', content: opts.prompt }],
        });
        for await (const evento of stream) {
            if (evento.type === 'content_block_delta' && (evento.delta as { type?: string }).type === 'text_delta') {
                yield (evento.delta as { text: string }).text;
            }
        }
        return;
    }

    const stream = await agente.openai.chat.completions.create({
        model: agente.modelo,
        ...topeOpenAI(agente.modelo, opts.maxTokens),
        messages: [{ role: 'user', content: opts.prompt }],
        stream: true,
    });
    for await (const parte of stream) {
        const trozo = parte.choices[0]?.delta?.content;
        if (trozo) yield trozo;
    }
}
