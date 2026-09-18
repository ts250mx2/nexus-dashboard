import Anthropic from '@anthropic-ai/sdk';

/**
 * Cliente de respaldo con la llave del .env. Solo corre cuando HL Console
 * (lib/hl-cliente.ts) no está configurado o no contesta; con HL activo las
 * llamadas van por su proxy y esta llave ni se usa.
 */
export const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

/** Modelos de respaldo, para cuando no hay HL. Con HL el modelo lo fija el portal. */
export const DEFAULT_MODEL = 'claude-opus-4-7';
export const FAST_MODEL = 'claude-sonnet-4-6';

/**
 * Extrae el TEXTO de una respuesta de Anthropic de forma robusta.
 *
 * Los modelos con "extended thinking" devuelven un bloque de tipo `thinking`
 * ANTES del `text`, así que `content[0].text` viene vacío y rompe la narración.
 * Busca el primer bloque de tipo 'text' en lugar de asumir la posición 0.
 */
export function anthropicText(
    response: { content?: Array<{ type?: string; text?: string }> } | null | undefined
): string {
    const block = response?.content?.find((c) => c?.type === 'text');
    return block?.text ?? '';
}
