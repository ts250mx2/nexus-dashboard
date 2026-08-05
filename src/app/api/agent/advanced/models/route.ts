import { NextResponse } from 'next/server';
import { MODEL_REGISTRY, DEFAULT_MODEL_ID } from '@/lib/advanced-reports/models';

export const runtime = 'nodejs';

/** GET /api/agent/advanced/models → modelos disponibles para el selector. */
export async function GET() {
    return NextResponse.json({
        defaultModelId: DEFAULT_MODEL_ID,
        models: MODEL_REGISTRY.map((m) => ({
            id: m.id,
            label: m.label,
            provider: m.provider,
            inputUsdPerMTok: m.inputUsdPerMTok,
            outputUsdPerMTok: m.outputUsdPerMTok,
        })),
    });
}
