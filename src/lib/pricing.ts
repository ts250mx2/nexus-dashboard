/**
 * Modelo de costo del Agente Avanzado.
 *
 * Convierte consumo de tokens a USD (según el precio del modelo elegido) y a
 * su equivalente en MXN. El tipo de cambio es configurable vía .env:
 *
 *   USD_MXN_RATE   tipo de cambio USD -> MXN (default offline-safe)
 *
 * Los precios por modelo viven en src/lib/advanced-reports/models.ts.
 */

export const USD_MXN_RATE = Number(process.env.USD_MXN_RATE || 18.5);

/** Costo en USD dado el precio (USD por millón de tokens) de entrada/salida. */
export function costUsd(
    inputTokens: number,
    outputTokens: number,
    inputUsdPerMTok: number,
    outputUsdPerMTok: number
): number {
    const usd =
        (inputTokens / 1_000_000) * inputUsdPerMTok +
        (outputTokens / 1_000_000) * outputUsdPerMTok;
    return Math.round(usd * 10000) / 10000;
}

/** Convierte USD a MXN con el tipo de cambio configurado. */
export function costMxn(usd: number): number {
    return Math.round(usd * USD_MXN_RATE * 100) / 100;
}

export interface CostBreakdown {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    costMxn: number;
    usdMxnRate: number;
}

export function buildCostBreakdown(
    inputTokens: number,
    outputTokens: number,
    inputUsdPerMTok: number,
    outputUsdPerMTok: number
): CostBreakdown {
    const usd = costUsd(inputTokens, outputTokens, inputUsdPerMTok, outputUsdPerMTok);
    return { inputTokens, outputTokens, costUsd: usd, costMxn: costMxn(usd), usdMxnRate: USD_MXN_RATE };
}

export function formatUsd(n: number): string {
    return `$${n.toFixed(n < 1 ? 4 : 2)} USD`;
}

export function formatMxn(n: number): string {
    return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
}
