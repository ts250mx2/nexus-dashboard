import { anthropic, anthropicText } from './anthropic';
import { clienteAnthropicHl, clienteOpenAIHl, credencialOpcional, type CredencialHl } from './hl-agentes';

/**
 * Una sola llamada de texto a la IA, sin importar qué proveedor tenga asignado
 * el agente en HL Console.
 *
 * Lo usan los ayudantes que solo mandan un prompt y leen la respuesta:
 * insights del día, resumen de página, Explícame, razonador causal,
 * investigador y prompts proactivos. El chat (/api/query) y los reportes
 * avanzados NO pasan por aquí: usan herramientas y streaming, así que arman su
 * propio cliente con `credencialOpcional()`.
 *
 * Con HL configurado la llamada va por su proxy y el modelo lo fija el portal;
 * `modeloRespaldo` solo se usa cuando HL no está configurado o no contesta.
 */

export interface PeticionTexto {
    /** Prompt del usuario (el texto completo, ya armado). */
    prompt: string;
    /** Tope de tokens de la respuesta. */
    maxTokens: number;
    /** Modelo con el que se corre si HL no está disponible (llaves del .env). */
    modeloRespaldo: string;
    /** Instrucción de sistema, opcional. */
    system?: string;
}

export interface RespuestaIA {
    /** Texto de la respuesta; cadena vacía si el proveedor no devolvió texto. */
    texto: string;
    /** Modelo que de verdad contestó (el de HL cuando está activo). */
    modelo: string;
    tokensEntrada?: number;
    tokensSalida?: number;
}

/** Modelos de razonamiento de OpenAI: piden max_completion_tokens en vez de max_tokens. */
const MODELO_RAZONADOR = /^(gpt-5|o\d)/i;

async function correrOpenAI(cred: CredencialHl, p: PeticionTexto): Promise<RespuestaIA> {
    const cliente = clienteOpenAIHl(cred);
    const tope = MODELO_RAZONADOR.test(cred.modelo)
        ? { max_completion_tokens: p.maxTokens }
        : { max_tokens: p.maxTokens };

    const resp = await cliente.chat.completions.create({
        model: cred.modelo,
        ...tope,
        messages: [
            ...(p.system ? [{ role: 'system' as const, content: p.system }] : []),
            { role: 'user' as const, content: p.prompt },
        ],
    });
    return {
        texto: resp.choices[0]?.message?.content ?? '',
        modelo: cred.modelo,
        tokensEntrada: resp.usage?.prompt_tokens,
        tokensSalida: resp.usage?.completion_tokens,
    };
}

async function correrAnthropic(cred: CredencialHl | null, p: PeticionTexto): Promise<RespuestaIA> {
    const cliente = cred ? clienteAnthropicHl(cred) : anthropic;
    const modelo = cred ? cred.modelo : p.modeloRespaldo;
    const resp = await cliente.messages.create({
        model: modelo,
        max_tokens: p.maxTokens,
        ...(p.system ? { system: p.system } : {}),
        messages: [{ role: 'user', content: p.prompt }],
    });
    return {
        texto: anthropicText(resp),
        modelo,
        tokensEntrada: resp.usage?.input_tokens,
        tokensSalida: resp.usage?.output_tokens,
    };
}

/**
 * Respuesta del agente con el modelo y los tokens que reportó el proveedor.
 * Los errores del proveedor SÍ suben, para que quien llama decida.
 */
export async function respuestaIA(p: PeticionTexto): Promise<RespuestaIA> {
    const cred = await credencialOpcional();
    return cred?.sdk === 'openai' ? correrOpenAI(cred, p) : correrAnthropic(cred, p);
}

/** Solo el texto, para quien no necesita el modelo ni los tokens. */
export async function textoIA(p: PeticionTexto): Promise<string> {
    return (await respuestaIA(p)).texto;
}

/**
 * El JSON que venga dentro de la respuesta, o null si no trae uno válido.
 * Casi todos los ayudantes piden "devuelve SOLO el JSON" y luego recortan entre
 * la primera llave y la última; esto es esa misma lectura, en un solo lugar.
 */
export function extraerJson<T = unknown>(texto: string): T | null {
    const inicio = texto.indexOf('{');
    const fin = texto.lastIndexOf('}');
    if (inicio < 0 || fin <= inicio) return null;
    try {
        return JSON.parse(texto.substring(inicio, fin + 1)) as T;
    } catch {
        return null;
    }
}
