/**
 * Insights diarios automáticos.
 *
 * Ejecuta los scanners definidos en insights-scanners.ts y le pide a Claude
 * que produzca:
 *  - briefing narrativo del día (2-3 oraciones con **negritas**)
 *  - 3-6 hallazgos con { id, question, severity, area, summary } listos para
 *    ser preguntados al agente con un click.
 */

import { NextResponse } from 'next/server';
import { anthropic, FAST_MODEL } from '@/lib/anthropic';
import { query } from '@/lib/db';
import { assertReadOnly } from '@/lib/sql-sandbox';
import { INSIGHT_SCANNERS } from '@/lib/insights-scanners';
import { getUserId } from '@/lib/conversations';
import { cronLimiter } from '@/lib/rate-limit';
import { recordMetric } from '@/lib/metrics';

interface Insight {
    id: string;
    question: string;
    severity: 'critical' | 'opportunity' | 'info';
    area: string;
    summary: string;
}

export async function GET(req: Request) {
    const startTime = Date.now();
    try {
        const userId = await getUserId();
        const url = new URL(req.url);
        const forceRefresh = url.searchParams.get('refresh') === 'true';

        if (forceRefresh) {
            const limit = cronLimiter.check(`insights:${userId}`);
            if (!limit.allowed) {
                return NextResponse.json({ error: 'Insights ejecutados muy recientemente' }, { status: 429 });
            }
        }

        // Ejecuta scanners en paralelo
        const scanResults = await Promise.all(
            INSIGHT_SCANNERS.map(async (s) => {
                try {
                    const safe = assertReadOnly(s.sql);
                    const data = await query(safe);
                    return { id: s.id, area: s.area, label: s.label, description: s.description, data: data.slice(0, 10) };
                } catch (e: any) {
                    return { id: s.id, area: s.area, label: s.label, description: s.description, data: [], error: e?.message };
                }
            })
        );

        const usefulScans = scanResults.filter(s => s.data && s.data.length > 0);

        const synthesisPrompt = `Eres Nexus IA, consultor senior. Tienes los resultados de varios scanners sobre el negocio.

Produce DOS cosas:

1. BRIEFING: 2-3 oraciones narrativas que resuman el pulso del día. Métricas inline en **negritas**. Tono directo de un consultor que entra a una junta. NO uses encabezados ni bullets.

2. HALLAZGOS (3-6): preguntas accionables que el usuario querría hacer al agente. Cada una debe tener un ángulo concreto, no genérico.

Estructura JSON:
{
  "briefing": "El día va en **$X**, 8% arriba de ayer. Sucursal Norte tira fuerte; Sur arrastra desde temprano...",
  "insights": [
    {
      "id": "ventas_dia",
      "question": "¿Por qué Sucursal Sur cayó **25%** vs ayer?",
      "severity": "critical",
      "area": "Ventas",
      "summary": "Una oración corta con contexto"
    }
  ]
}

REGLAS:
- "severity": "critical" (acción urgente), "opportunity" (logro/momentum), "info" (contexto)
- "question" debe estar lista para preguntar al agente — incluye números si destacan
- Si no hay nada destacable de un área, omítela
- Si los datos son muy normales, briefing y 3-4 insights de "info" es suficiente
- Devuelve SOLO JSON, sin markdown

DATOS DE SCANNERS:
${JSON.stringify(usefulScans, null, 2)}`;

        const completion = await anthropic.messages.create({
            model: FAST_MODEL,
            max_tokens: 2500,
            messages: [{ role: 'user', content: synthesisPrompt }]
        });

        const text = (completion.content[0] as any)?.text || '{}';
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');

        let briefing = '';
        let insights: Insight[] = [];

        try {
            const parsed = JSON.parse(text.substring(start, end + 1));
            briefing = String(parsed.briefing || '').slice(0, 600);
            insights = (Array.isArray(parsed.insights) ? parsed.insights : [])
                .slice(0, 6)
                .map((x: any, i: number): Insight => ({
                    id: String(x.id || `ins_${i}`).slice(0, 50),
                    question: String(x.question || '').slice(0, 200),
                    severity: (['critical', 'opportunity', 'info'].includes(x.severity) ? x.severity : 'info') as Insight['severity'],
                    area: String(x.area || 'Negocio').slice(0, 50),
                    summary: String(x.summary || '').slice(0, 200)
                }))
                .filter((x: Insight) => x.question);
        } catch {
            insights = [];
        }

        void recordMetric({
            userId,
            endpoint: '/api/agent/daily-insights',
            model: FAST_MODEL,
            status: 'ok',
            latencyMs: Date.now() - startTime,
            tokensInput: completion.usage?.input_tokens,
            tokensOutput: completion.usage?.output_tokens,
            extra: { scanners: scanResults.length, insights: insights.length }
        });

        return NextResponse.json({
            generated_at: new Date().toISOString(),
            scanners_run: scanResults.length,
            briefing,
            insights,
            raw_scans: scanResults
        });
    } catch (error: any) {
        void recordMetric({
            userId: 'unknown',
            endpoint: '/api/agent/daily-insights',
            status: 'error',
            latencyMs: Date.now() - startTime,
            errorMsg: error?.message
        });
        return NextResponse.json({ error: error.message, insights: [], briefing: '' }, { status: 500 });
    }
}
