/**
 * Registro de modelos disponibles para el Agente Avanzado.
 *
 * Incluye Claude (Anthropic) y GPT (OpenAI). Cada modelo trae su proveedor y
 * su precio por millón de tokens (USD) para calcular el costo de cada reporte.
 * Los precios son aproximados/públicos y se pueden ajustar aquí o por .env.
 *
 * NOTA: este módulo lee process.env, así que es SOLO de servidor. El cliente
 * obtiene la lista vía GET /api/agent/advanced/models.
 */

export type Provider = 'anthropic' | 'openai';

export interface ModelInfo {
    id: string;
    label: string;
    provider: Provider;
    inputUsdPerMTok: number;
    outputUsdPerMTok: number;
}

export const MODEL_REGISTRY: ModelInfo[] = [
    // --- Anthropic (Claude) ---
    {
        id: 'claude-opus-5',
        label: 'Claude Opus 5 (máxima potencia)',
        provider: 'anthropic',
        inputUsdPerMTok: Number(process.env.ANTHROPIC_OPUS_INPUT_USD_PER_MTOK || 15),
        outputUsdPerMTok: Number(process.env.ANTHROPIC_OPUS_OUTPUT_USD_PER_MTOK || 75),
    },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (rápido)', provider: 'anthropic', inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (económico)', provider: 'anthropic', inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
    // --- OpenAI (GPT) ---
    { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai', inputUsdPerMTok: 2.5, outputUsdPerMTok: 10 },
];

export const DEFAULT_MODEL_ID = process.env.ADVANCED_DEFAULT_MODEL || 'claude-opus-5';

/** Devuelve la info del modelo por id; cae al default si no existe. */
export function getModel(id?: string | null): ModelInfo {
    if (id) {
        const found = MODEL_REGISTRY.find((m) => m.id === id);
        if (found) return found;
    }
    return MODEL_REGISTRY.find((m) => m.id === DEFAULT_MODEL_ID) || MODEL_REGISTRY[0];
}

/**
 * Recomienda el modelo de GENERACIÓN según la complejidad del reporte:
 *   alta  → Opus 5 (joins múltiples, series, causa raíz, comparativas complejas)
 *   media → Sonnet 5 (varias columnas/períodos, joins ligeros)
 *   baja  → Haiku 4.5 (1 tabla, agregación simple)
 */
export function recommendModelForComplexity(complexity?: string | null): string {
    switch ((complexity || '').toLowerCase()) {
        case 'alta': return 'claude-opus-5';
        case 'media': return 'claude-sonnet-5';
        case 'baja': return 'claude-haiku-4-5-20251001';
        default: return DEFAULT_MODEL_ID;
    }
}
