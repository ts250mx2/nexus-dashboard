import { NextResponse } from 'next/server';
import { anthropic } from '@/lib/anthropic';
import { openai } from '@/lib/ai';
import { createSseStream, SSE_HEADERS, type SseEvent } from '@/lib/sse';
import { queryLimiter } from '@/lib/rate-limit';
import { getUserId } from '@/lib/conversations';
import { recordMetric } from '@/lib/metrics';
import { costUsd, costMxn, USD_MXN_RATE } from '@/lib/pricing';
import { getModel, recommendModelForComplexity } from '@/lib/advanced-reports/models';
import {
    ADVANCED_TOOLS,
    ADVANCED_OPENAI_TOOLS,
    buildAdvancedSystemPrompt,
    getAdvancedSchemaString,
    executeAdvancedTool,
} from '@/lib/advanced-reports/tools';
import { insertReportRun } from '@/lib/advanced-reports/reports-store';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_TURNS = 10;

interface Turn {
    role: 'user' | 'assistant';
    content: string;
}

function buildMessages(prompt: string, history: unknown): any[] {
    const cleaned = (Array.isArray(history) ? (history as Turn[]) : [])
        .filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim())
        .map((t) => ({ role: t.role, content: t.content.length > 4000 ? t.content.slice(0, 4000) + '…' : t.content }));
    while (cleaned.length > 0 && cleaned[0].role !== 'user') cleaned.shift();
    return [...cleaned, { role: 'user', content: prompt }];
}

/**
 * POST /api/agent/advanced/run?stream=true
 *
 * Loop multi-turno de tool-use. USA EL MODELO ELEGIDO (body.model): si es de
 * Anthropic corre el loop con tool_use; si es de OpenAI, con tool_calls. Emite
 * cada paso por SSE. La conversación NO guarda reportes: cuando el agente
 * llama propose_report se corta el turno y el cliente muestra el modal de costo.
 */
export async function POST(req: Request) {
    const startTime = Date.now();
    const userId = await getUserId().catch(() => 'anonymous');

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    }

    const prompt = String(body?.prompt || '').trim();
    if (!prompt) return NextResponse.json({ error: 'Falta el prompt' }, { status: 400 });

    const limit = queryLimiter.check(`advanced:${userId}`);
    if (!limit.allowed) {
        return NextResponse.json(
            { error: `Demasiadas ejecuciones. Intenta en ${Math.ceil(limit.retryAfterMs / 1000)}s.` },
            { status: 429 }
        );
    }

    // La conversación (preguntas/propuestas) usa un modelo más barato por defecto;
    // el modelo de GENERACIÓN del reporte se elige al armarlo (endpoint /build).
    const model = getModel(body?.model || process.env.ADVANCED_CONVERSATION_MODEL || 'claude-sonnet-5');
    const system = buildAdvancedSystemPrompt(getAdvancedSchemaString());
    const baseMessages = buildMessages(prompt, body?.history);

    const stream = createSseStream(async (emit: (e: SseEvent) => void, close: () => void) => {
        let cumIn = 0;
        let cumOut = 0;
        let turns = 0;

        const emitUsage = (turn: number, inTok: number, outTok: number) => {
            const usdSoFar = costUsd(cumIn, cumOut, model.inputUsdPerMTok, model.outputUsdPerMTok);
            emit({
                event: 'usage',
                data: {
                    turn,
                    inputTokens: inTok,
                    outputTokens: outTok,
                    cumulativeInput: cumIn,
                    cumulativeOutput: cumOut,
                    costUsdSoFar: usdSoFar,
                    costMxnSoFar: costMxn(usdSoFar),
                },
            });
        };

        // Ejecuta una tool y emite sus eventos; devuelve el texto-resultado para el modelo.
        const runTool = async (name: string, input: any): Promise<{ content: string; isError: boolean }> => {
            emit({ event: 'tool-call', data: { name, input } });
            try {
                const outcome = await executeAdvancedTool(name, input);
                if (outcome.sql) emit({ event: 'sql', data: { sql: outcome.sql } });
                emit({ event: 'tool-result', data: { name, ok: true, rowCount: outcome.rowCount } });
                return { content: outcome.resultText, isError: false };
            } catch (e: any) {
                const msg = e?.message || String(e);
                emit({ event: 'tool-result', data: { name, ok: false, error: msg } });
                return { content: JSON.stringify({ ok: false, error: msg }), isError: true };
            }
        };

        try {
            emit({ event: 'status', data: { phase: 'thinking', detail: `Analizando tu petición con ${model.label}…` } });

            if (model.provider === 'anthropic') {
                const messages: any[] = [...baseMessages];
                let stop = false;
                while (!stop && turns < MAX_TURNS) {
                    turns++;
                    const resp = await anthropic.messages.create({
                        model: model.id,
                        max_tokens: 8192,
                        system,
                        messages,
                        tools: ADVANCED_TOOLS,
                        tool_choice: { type: 'auto' },
                    });
                    cumIn += resp.usage?.input_tokens || 0;
                    cumOut += resp.usage?.output_tokens || 0;

                    for (const block of resp.content) {
                        if (block.type === 'text' && block.text.trim()) emit({ event: 'reasoning', data: { text: block.text } });
                    }
                    emitUsage(turns, resp.usage?.input_tokens || 0, resp.usage?.output_tokens || 0);

                    if (resp.stop_reason !== 'tool_use') { stop = true; break; }

                    messages.push({ role: 'assistant', content: resp.content });
                    const toolResults: any[] = [];
                    let halt = false;
                    for (const block of resp.content) {
                        if (block.type !== 'tool_use') continue;
                        if (block.name === 'ask_clarification') {
                            const q = String((block.input as any)?.question || '¿Me das un poco más de detalle?');
                            const sugg = Array.isArray((block.input as any)?.suggestions) ? (block.input as any).suggestions : [];
                            emit({ event: 'clarification', data: { question: q, suggestions: sugg } });
                            halt = true;
                            break;
                        }
                        if (block.name === 'propose_report') {
                            const def = block.input as any;
                            emit({ event: 'report-proposed', data: { definition: def, complexity: def?.complexity, recommendedModel: recommendModelForComplexity(def?.complexity) } });
                            halt = true;
                            break;
                        }
                        const r = await runTool(block.name, block.input);
                        toolResults.push({ type: 'tool_result', tool_use_id: (block as any).id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
                    }
                    if (halt) { stop = true; break; }
                    messages.push({ role: 'user', content: toolResults });
                }
            } else {
                // OpenAI (tool_calls)
                const messages: any[] = [{ role: 'system', content: system }, ...baseMessages];
                let stop = false;
                while (!stop && turns < MAX_TURNS) {
                    turns++;
                    const resp = await openai.chat.completions.create({
                        model: model.id,
                        max_tokens: 4096,
                        messages,
                        tools: ADVANCED_OPENAI_TOOLS,
                        tool_choice: 'auto',
                    });
                    cumIn += resp.usage?.prompt_tokens || 0;
                    cumOut += resp.usage?.completion_tokens || 0;

                    const msg = resp.choices[0]?.message;
                    if (msg?.content && msg.content.trim()) emit({ event: 'reasoning', data: { text: msg.content } });
                    emitUsage(turns, resp.usage?.prompt_tokens || 0, resp.usage?.completion_tokens || 0);

                    const toolCalls = msg?.tool_calls || [];
                    if (!toolCalls.length) { stop = true; break; }

                    messages.push(msg);
                    let halt = false;
                    for (const tc of toolCalls) {
                        const fn = (tc as any).function;
                        let input: any = {};
                        try { input = JSON.parse(fn?.arguments || '{}'); } catch { input = {}; }
                        if (fn?.name === 'ask_clarification') {
                            const q = String(input?.question || '¿Me das un poco más de detalle?');
                            const sugg = Array.isArray(input?.suggestions) ? input.suggestions : [];
                            emit({ event: 'clarification', data: { question: q, suggestions: sugg } });
                            halt = true;
                            break;
                        }
                        if (fn?.name === 'propose_report') {
                            emit({ event: 'report-proposed', data: { definition: input, complexity: input?.complexity, recommendedModel: recommendModelForComplexity(input?.complexity) } });
                            halt = true;
                            break;
                        }
                        const r = await runTool(fn?.name, input);
                        messages.push({ role: 'tool', tool_call_id: (tc as any).id, content: r.content });
                    }
                    if (halt) { stop = true; break; }
                }
            }

            // Conciliación de costo real de la conversación
            const finalUsd = costUsd(cumIn, cumOut, model.inputUsdPerMTok, model.outputUsdPerMTok);
            const finalMxn = costMxn(finalUsd);

            await insertReportRun({
                userId,
                idReporte: null,
                prompt,
                model: model.id,
                turnos: turns,
                tokensInput: cumIn,
                tokensOutput: cumOut,
                costoUsd: finalUsd,
                costoMxn: finalMxn,
                usdMxnRate: USD_MXN_RATE,
                status: 'ok',
                latenciaMs: Date.now() - startTime,
            });

            void recordMetric({
                userId,
                endpoint: '/api/agent/advanced/run',
                model: model.id,
                streaming: true,
                tokensInput: cumIn,
                tokensOutput: cumOut,
                latencyMs: Date.now() - startTime,
                status: 'ok',
                extra: { costoUsd: finalUsd, costoMxn: finalMxn, turns, provider: model.provider },
            });

            emit({
                event: 'done',
                data: {
                    finalCostUsd: finalUsd,
                    finalCostMxn: finalMxn,
                    cumulativeInput: cumIn,
                    cumulativeOutput: cumOut,
                    turns,
                    model: model.id,
                },
            });
        } catch (err: any) {
            const msg = err?.message || 'Error en el agente avanzado';
            emit({ event: 'error', data: { message: msg } });
            const finalUsd = costUsd(cumIn, cumOut, model.inputUsdPerMTok, model.outputUsdPerMTok);
            await insertReportRun({
                userId,
                idReporte: null,
                prompt,
                model: model.id,
                turnos: turns,
                tokensInput: cumIn,
                tokensOutput: cumOut,
                costoUsd: finalUsd,
                costoMxn: costMxn(finalUsd),
                usdMxnRate: USD_MXN_RATE,
                status: 'error',
                errorMsg: msg,
                latenciaMs: Date.now() - startTime,
            });
            void recordMetric({
                userId,
                endpoint: '/api/agent/advanced/run',
                model: model.id,
                streaming: true,
                tokensInput: cumIn,
                tokensOutput: cumOut,
                latencyMs: Date.now() - startTime,
                status: 'error',
                errorMsg: msg,
            });
        } finally {
            close();
        }
    });

    return new Response(stream, { headers: SSE_HEADERS });
}
