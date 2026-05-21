import { NextResponse } from 'next/server';
import { anthropic } from '@/lib/anthropic';

/**
 * POST /api/agent/page-summary
 *
 * Recibe el snapshot completo de un dashboard y genera un párrafo narrativo
 * editorial corto sobre lo que se ve.
 *
 * Body: {
 *   pageContext: string,
 *   period: { fechaInicio, fechaFin },
 *   scope: string,
 *   kpis: Record<string, any>,
 *   highlights?: { topStores?, topItems?, anomalies? }
 * }
 */

interface PageSummaryRequest {
    pageContext?: string;
    period?: { fechaInicio?: string; fechaFin?: string };
    scope?: string;
    kpis?: Record<string, any>;
    highlights?: {
        topStores?: Array<{ name: string; value: number }>;
        topItems?: Array<{ name: string; value: number }>;
        anomalies?: string[];
    };
}

function formatPeriod(p?: { fechaInicio?: string; fechaFin?: string }): string {
    if (!p?.fechaInicio || !p?.fechaFin) return 'período no especificado';
    if (p.fechaInicio === p.fechaFin) return `el ${p.fechaInicio}`;
    return `del ${p.fechaInicio} al ${p.fechaFin}`;
}

export async function POST(req: Request) {
    try {
        const body: PageSummaryRequest = await req.json();
        const { pageContext = 'el dashboard', period, scope, kpis = {}, highlights } = body;

        const periodText = formatPeriod(period);
        const scopeText = scope || 'todas las sucursales';

        const kpiLines = Object.entries(kpis)
            .filter(([, v]) => typeof v === 'number')
            .map(([k, v]) => `  ${k}: ${typeof v === 'number' && v >= 1000 ? new Intl.NumberFormat('es-MX').format(v) : v}`)
            .join('\n');

        const highlightsText = [
            highlights?.topStores?.length
                ? `Top sucursales: ${highlights.topStores.slice(0, 3).map(s => `${s.name} (${s.value.toLocaleString('es-MX')})`).join(', ')}`
                : null,
            highlights?.topItems?.length
                ? `Top items: ${highlights.topItems.slice(0, 3).map(i => `${i.name} (${i.value.toLocaleString('es-MX')})`).join(', ')}`
                : null,
            highlights?.anomalies?.length
                ? `Anomalías detectadas: ${highlights.anomalies.join('; ')}`
                : null
        ].filter(Boolean).join('\n');

        const prompt = `Eres Nexus IA, consultor senior. Vas a escribir un BRIEFING editorial corto
sobre lo que se ve en ${pageContext} ahora mismo.

CONTEXTO:
- Período: ${periodText}
- Alcance: ${scopeText}

KPIs visibles:
${kpiLines || '  (sin KPIs)'}

${highlightsText ? `Highlights:\n${highlightsText}` : ''}

INSTRUCCIONES:
Genera UN solo párrafo (2-4 oraciones) que:
1. Resuma lo más importante de lo que ve el usuario.
2. Use cifras INLINE con **negritas Markdown** (ej: **$1.4M**, **+12%**).
3. Tono profesional pero humano. No corporativo.
4. Si hay algo que llame la atención (concentración alta, caída, anomalía), menciónalo con tono sutil.
5. NO uses bullets, NO uses encabezados, NO digas "¿quieres profundizar?".
6. Si los datos son neutros, cuenta lo que hay sin inventar alarmas.

Determina también el TONO:
- "positive": Hay datos claramente positivos
- "attention": Hay algo que requiere mirar
- "neutral": Día/período normal

RESPONDE SOLO EN JSON (sin markdown):
{
  "summary": "Párrafo de 2-4 oraciones con **cifras en negritas**",
  "tone": "positive" | "attention" | "neutral"
}`;

        const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 800,
            messages: [{ role: 'user', content: prompt }]
        });

        const text = (response.content[0] as any)?.text || '';
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');

        let result: any = {};
        if (start >= 0 && end > start) {
            try {
                result = JSON.parse(text.substring(start, end + 1));
            } catch {
                result = { summary: text.slice(0, 500), tone: 'neutral' };
            }
        } else {
            result = { summary: text.slice(0, 500), tone: 'neutral' };
        }

        return NextResponse.json({
            summary: result.summary || 'No se generó resumen.',
            tone: result.tone || 'neutral'
        });
    } catch (error: any) {
        console.error('page-summary error:', error);
        return NextResponse.json(
            { error: error.message || 'Error generando resumen' },
            { status: 500 }
        );
    }
}
