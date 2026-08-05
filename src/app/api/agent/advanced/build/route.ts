import { NextResponse } from 'next/server';
import { anthropic } from '@/lib/anthropic';
import { openai } from '@/lib/ai';
import { getUserId } from '@/lib/conversations';
import { assertReadOnly } from '@/lib/sql-sandbox';
import { query } from '@/lib/db';
import { getModel } from '@/lib/advanced-reports/models';
import { normalizeViz, localizeDatesForModel } from '@/lib/advanced-reports/tools';
import { ADVANCED_REPORT_SCHEMA_VERSION, type AdvancedReportDefinition, type ReportBlock, type ReportBlockType } from '@/lib/advanced-reports/types';
import { createReport, updateReport, insertReportRun, getReportById } from '@/lib/advanced-reports/reports-store';
import { substituteParams } from '@/lib/advanced-reports/params';
import { costUsd, costMxn, USD_MXN_RATE } from '@/lib/pricing';
import { recordMetric } from '@/lib/metrics';

export const runtime = 'nodejs';
export const maxDuration = 300;

const VIEWER_BASE = '/dashboard/reportes-ia/mis-reportes';

function parseJsonLoose(text: string): any {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return {};
    try { return JSON.parse(text.substring(start, end + 1)); } catch { return {}; }
}

/**
 * POST /api/agent/advanced/build
 *
 * Crea (genera + guarda) un reporte a partir de la propuesta del agente, con el
 * NOMBRE y el MODELO que el usuario eligió en el modal de costo. El modelo elegido
 * genera los hallazgos/recomendaciones desde datos frescos; el costo se calcula
 * con su precio. Aquí es donde se incurre y se muestra el costo (no en la charla).
 */
export async function POST(req: Request) {
    const startTime = Date.now();
    const userId = await getUserId().catch(() => 'anonymous');

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }); }

    const proposal = body?.definition || {};
    const name = String(body?.name || proposal?.title || 'Reporte sin título').trim().slice(0, 300);
    const model = getModel(body?.model);

    const rawSql = String(proposal?.sql || '');
    const params = Array.isArray(proposal?.params) ? proposal.params : undefined;
    const editId = Number(body?.idReporte);
    const overwrite = body?.mode === 'overwrite' && Number.isFinite(editId) && editId > 0;

    const proposalBlocks: any[] | null = Array.isArray(proposal?.blocks) && proposal.blocks.length > 0 ? proposal.blocks : null;

    if (!rawSql.trim() && !proposalBlocks) {
        return NextResponse.json({ error: 'La propuesta no incluye SQL' }, { status: 400 });
    }

    try {
        // ════════════════════════════════════════════════════════════════════
        // CAMINO MULTI-BLOQUE (tablero). Ejecuta el SQL de cada bloque, genera UNA
        // narrativa del conjunto y guarda la definición con `blocks`.
        // ════════════════════════════════════════════════════════════════════
        if (proposalBlocks) {
            const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
            const blocksSig = (bs: any[]) => JSON.stringify((bs || []).map((b: any) => ({ t: b?.type, sql: norm(b?.sql || ''), kpis: b?.kpis || null })));

            // Atajo solo-presentación al editar: si el SQL de los bloques y los params
            // no cambian, solo redibuja (sin correr consultas ni IA → sin costo).
            if (overwrite) {
                const existing = await getReportById(userId, editId);
                if (existing?.definition?.blocks?.length) {
                    const sameBlocks = blocksSig(existing.definition.blocks) === blocksSig(proposalBlocks);
                    const sameParams = JSON.stringify(existing.definition.params || []) === JSON.stringify(proposal.params || existing.definition.params || []);
                    if (sameBlocks && sameParams) {
                        // Mezcla SOLO presentación (title/visualization/chartConfig/kpis) por id; conserva el SQL.
                        const byId = new Map<string, any>((proposalBlocks).map((b: any, i: number) => [String(b?.id || `b${i + 1}`), b]));
                        const merged: ReportBlock[] = existing.definition.blocks.map((eb, i) => {
                            const nb = byId.get(String(eb.id || `b${i + 1}`));
                            if (!nb) return eb;
                            return {
                                ...eb,
                                title: nb.title ?? eb.title,
                                visualization: eb.type === 'chart' ? normalizeViz(nb.visualization || eb.visualization) : eb.visualization,
                                chartConfig: nb.chartConfig ?? eb.chartConfig,
                                kpis: eb.type === 'kpis' && Array.isArray(nb.kpis) ? nb.kpis : eb.kpis,
                            };
                        });
                        const definition: AdvancedReportDefinition = {
                            ...existing.definition,
                            title: name,
                            description: proposal.description ?? existing.definition.description,
                            blocks: merged,
                        };
                        await updateReport(userId, editId, definition, undefined, existing.modelo || undefined, USD_MXN_RATE);
                        return NextResponse.json({
                            idReporte: editId, url: `${VIEWER_BASE}/${editId}`, title: name, overwrite: true, presentationOnly: true,
                            cost: { tokensInput: 0, tokensOutput: 0, costUsd: 0, costMxn: 0, usdMxnRate: USD_MXN_RATE },
                        });
                    }
                }
            }

            // Valida + corre cada bloque (con los defaults de los params) y arma un digest para la narrativa.
            const normalizedBlocks: ReportBlock[] = [];
            const digest: Array<{ title: string; type: string; rowCount: number; sample: any[] }> = [];
            for (let i = 0; i < proposalBlocks.length; i++) {
                const b = proposalBlocks[i];
                const allowed: ReportBlockType[] = ['kpis', 'chart', 'table', 'narrative'];
                const type: ReportBlockType = allowed.includes(b?.type) ? b.type : 'chart';
                const id = String(b?.id || `b${i + 1}`);
                if (type === 'narrative') {
                    normalizedBlocks.push({ id, type, title: b?.title, narrative: { source: b?.narrative?.source === 'static' ? 'static' : 'ai', text: b?.narrative?.text } });
                    continue;
                }
                const rawBlockSql = String(b?.sql || '');
                if (!rawBlockSql.trim()) continue; // bloque sin SQL → se omite
                const runSql = assertReadOnly(substituteParams(rawBlockSql, params));
                const rows = (await query(runSql)) as any[];
                normalizedBlocks.push({
                    id, type, title: b?.title,
                    sql: rawBlockSql, // se guarda CON tokens {{...}}; el visor los sustituye al ver
                    visualization: type === 'chart' ? normalizeViz(b?.visualization) : undefined,
                    chartConfig: b?.chartConfig,
                    kpis: type === 'kpis' && Array.isArray(b?.kpis) ? b.kpis : undefined,
                    expectedColumns: Array.isArray(b?.expectedColumns) ? b.expectedColumns : undefined,
                    drill: b?.drill?.sql ? { sql: String(b.drill.sql), title: b.drill.title, visualization: b.drill.visualization ? normalizeViz(b.drill.visualization) : undefined } : undefined,
                });
                digest.push({ title: String(b?.title || `Bloque ${i + 1}`), type, rowCount: rows.length, sample: localizeDatesForModel(rows.slice(0, 12)) });
            }

            if (normalizedBlocks.length === 0) {
                return NextResponse.json({ error: 'La propuesta no incluye bloques con SQL válido' }, { status: 400 });
            }

            // UNA sola llamada de IA: lectura accionable del tablero completo.
            const prompt = `Eres un consultor senior de retail. Analiza este TABLERO ("${name}") compuesto por varios bloques y entrega una lectura accionable del CONJUNTO.
BLOQUES: ${JSON.stringify(digest).slice(0, 8000)}

Responde SOLO con JSON válido (sin markdown), en español:
{
  "insights": ["3-4 hallazgos concretos con cifras (usa **negritas** Markdown)"],
  "recommendations": ["1-3 acciones recomendadas"]
}`;
            let text = '';
            let inTok = 0;
            let outTok = 0;
            if (digest.some((d) => d.rowCount > 0)) {
                if (model.provider === 'anthropic') {
                    const resp = await anthropic.messages.create({ model: model.id, max_tokens: 1200, messages: [{ role: 'user', content: prompt }] });
                    text = (resp.content.find((c: any) => c.type === 'text') as any)?.text || '';
                    inTok = resp.usage?.input_tokens || 0;
                    outTok = resp.usage?.output_tokens || 0;
                } else {
                    const resp = await openai.chat.completions.create({ model: model.id, max_tokens: 1200, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } });
                    text = resp.choices[0]?.message?.content || '';
                    inTok = resp.usage?.prompt_tokens || 0;
                    outTok = resp.usage?.completion_tokens || 0;
                }
            }
            const parsed = parseJsonLoose(text);
            const insights = Array.isArray(parsed.insights) && parsed.insights.length ? parsed.insights : (Array.isArray(proposal.insights) ? proposal.insights : []);
            const recommendations = Array.isArray(parsed.recommendations) && parsed.recommendations.length ? parsed.recommendations : (Array.isArray(proposal.recommendations) ? proposal.recommendations : []);
            const usd = costUsd(inTok, outTok, model.inputUsdPerMTok, model.outputUsdPerMTok);
            const mxn = costMxn(usd);

            // sql/visualization de raíz: representativos (primer bloque con SQL / primer chart) para
            // consumidores que aún leen el formato single (galería, Modo IA del visor).
            const firstWithSql = normalizedBlocks.find((b) => b.sql);
            const firstChart = normalizedBlocks.find((b) => b.type === 'chart' && b.visualization);

            const definition: AdvancedReportDefinition = {
                schemaVersion: ADVANCED_REPORT_SCHEMA_VERSION,
                title: name,
                description: proposal.description ? String(proposal.description).slice(0, 1000) : undefined,
                sql: firstWithSql?.sql || '',
                expectedColumns: firstWithSql?.expectedColumns || [],
                visualization: normalizeViz(firstChart?.visualization || 'table'),
                blocks: normalizedBlocks,
                drill: proposal.drill?.sql ? { sql: String(proposal.drill.sql), title: proposal.drill.title, visualization: proposal.drill.visualization ? normalizeViz(proposal.drill.visualization) : undefined } : undefined,
                params,
                insights,
                recommendations,
                suggestedQuestions: Array.isArray(proposal.suggestedQuestions) ? proposal.suggestedQuestions : [],
                createdWith: { model: model.id, createdAt: new Date().toISOString() },
            };

            const real = { tokensInput: inTok, tokensOutput: outTok, costoUsd: usd, costoMxn: mxn };
            const idReporte = overwrite
                ? await updateReport(userId, editId, definition, real, model.id, USD_MXN_RATE)
                : await createReport({ userId, definition, real, usdMxnRate: USD_MXN_RATE, model: model.id });

            await insertReportRun({
                userId, idReporte, prompt: `BUILD (tablero ${normalizedBlocks.length} bloques): ${name}`,
                model: model.id, turnos: 1, tokensInput: inTok, tokensOutput: outTok,
                costoUsd: usd, costoMxn: mxn, usdMxnRate: USD_MXN_RATE, status: 'ok', latenciaMs: Date.now() - startTime,
            });
            void recordMetric({
                userId, endpoint: '/api/agent/advanced/build', model: model.id,
                tokensInput: inTok, tokensOutput: outTok, latencyMs: Date.now() - startTime, status: 'ok',
                extra: { idReporte, costoUsd: usd, costoMxn: mxn, blocks: normalizedBlocks.length },
            });

            return NextResponse.json({
                idReporte, url: `${VIEWER_BASE}/${idReporte}`, title: name, overwrite,
                cost: { tokensInput: inTok, tokensOutput: outTok, costUsd: usd, costMxn: mxn, usdMxnRate: USD_MXN_RATE },
            });
        }

        // ── SOLO PRESENTACIÓN: si editamos y el SQL/params NO cambian, no recalcular
        //    (sin correr la consulta ni llamar a la IA → sin costo). Solo redibuja.
        if (overwrite) {
            const existing = await getReportById(userId, editId);
            if (existing?.definition) {
                const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
                const sameSql = norm(existing.definition.sql) === norm(rawSql);
                const sameParams = JSON.stringify(existing.definition.params || []) === JSON.stringify(proposal.params || existing.definition.params || []);
                if (sameSql && sameParams) {
                    const definition: AdvancedReportDefinition = {
                        ...existing.definition,
                        title: name,
                        description: proposal.description ?? existing.definition.description,
                        visualization: normalizeViz(proposal.visualization || existing.definition.visualization),
                        chartConfig: proposal.chartConfig ?? existing.definition.chartConfig,
                        kpis: Array.isArray(proposal.kpis) ? proposal.kpis : existing.definition.kpis,
                        expectedColumns: Array.isArray(proposal.expectedColumns) && proposal.expectedColumns.length ? proposal.expectedColumns : existing.definition.expectedColumns,
                        insights: Array.isArray(proposal.insights) && proposal.insights.length ? proposal.insights : existing.definition.insights,
                        recommendations: Array.isArray(proposal.recommendations) && proposal.recommendations.length ? proposal.recommendations : existing.definition.recommendations,
                    };
                    await updateReport(userId, editId, definition, undefined, existing.modelo || undefined, USD_MXN_RATE);
                    return NextResponse.json({
                        idReporte: editId,
                        url: `${VIEWER_BASE}/${editId}`,
                        title: name,
                        overwrite: true,
                        presentationOnly: true,
                        cost: { tokensInput: 0, tokensOutput: 0, costUsd: 0, costMxn: 0, usdMxnRate: USD_MXN_RATE },
                    });
                }
            }
        }

        // Para generar/validar, corre el SQL con los valores POR DEFECTO de los parámetros.
        const sql = assertReadOnly(substituteParams(rawSql, params));
        const rows = (await query(sql)) as any[];

        // El modelo elegido genera la lectura del reporte con datos frescos
        const sample = localizeDatesForModel(rows.slice(0, 50));
        const prompt = `Eres un consultor senior de retail. Analiza los datos del reporte "${name}" y entrega una lectura accionable.
DATOS (${rows.length} filas, muestra de ${sample.length}): ${JSON.stringify(sample).slice(0, 8000)}

Responde SOLO con JSON válido (sin markdown), en español:
{
  "insights": ["3-4 hallazgos concretos con cifras (usa **negritas** Markdown)"],
  "recommendations": ["1-3 acciones recomendadas"]
}`;

        let text = '';
        let inTok = 0;
        let outTok = 0;

        if (rows.length > 0) {
            if (model.provider === 'anthropic') {
                const resp = await anthropic.messages.create({
                    model: model.id,
                    max_tokens: 1200,
                    messages: [{ role: 'user', content: prompt }],
                });
                text = (resp.content.find((c: any) => c.type === 'text') as any)?.text || '';
                inTok = resp.usage?.input_tokens || 0;
                outTok = resp.usage?.output_tokens || 0;
            } else {
                const resp = await openai.chat.completions.create({
                    model: model.id,
                    max_tokens: 1200,
                    messages: [{ role: 'user', content: prompt }],
                    response_format: { type: 'json_object' },
                });
                text = resp.choices[0]?.message?.content || '';
                inTok = resp.usage?.prompt_tokens || 0;
                outTok = resp.usage?.completion_tokens || 0;
            }
        }

        const parsed = parseJsonLoose(text);
        const insights = Array.isArray(parsed.insights) && parsed.insights.length
            ? parsed.insights
            : (Array.isArray(proposal.insights) ? proposal.insights : []);
        const recommendations = Array.isArray(parsed.recommendations) && parsed.recommendations.length
            ? parsed.recommendations
            : (Array.isArray(proposal.recommendations) ? proposal.recommendations : []);

        const usd = costUsd(inTok, outTok, model.inputUsdPerMTok, model.outputUsdPerMTok);
        const mxn = costMxn(usd);

        const definition: AdvancedReportDefinition = {
            schemaVersion: ADVANCED_REPORT_SCHEMA_VERSION,
            title: name,
            description: proposal.description ? String(proposal.description).slice(0, 1000) : undefined,
            sql: rawSql, // se guarda CON tokens {{...}}; el visor los sustituye con los filtros del usuario
            expectedColumns: Array.isArray(proposal.expectedColumns) ? proposal.expectedColumns : [],
            visualization: normalizeViz(proposal.visualization),
            chartConfig: proposal.chartConfig,
            kpis: Array.isArray(proposal.kpis) ? proposal.kpis : undefined,
            drill: proposal.drill?.sql ? { sql: String(proposal.drill.sql), title: proposal.drill.title, visualization: proposal.drill.visualization ? normalizeViz(proposal.drill.visualization) : undefined } : undefined,
            params,
            insights,
            recommendations,
            suggestedQuestions: Array.isArray(proposal.suggestedQuestions) ? proposal.suggestedQuestions : [],
            createdWith: { model: model.id, createdAt: new Date().toISOString() },
        };

        // Editar en su lugar (overwrite) o crear nuevo
        const real = { tokensInput: inTok, tokensOutput: outTok, costoUsd: usd, costoMxn: mxn };
        const idReporte = overwrite
            ? await updateReport(userId, editId, definition, real, model.id, USD_MXN_RATE)
            : await createReport({ userId, definition, real, usdMxnRate: USD_MXN_RATE, model: model.id });

        await insertReportRun({
            userId,
            idReporte,
            prompt: `BUILD: ${name}`,
            model: model.id,
            turnos: 1,
            tokensInput: inTok,
            tokensOutput: outTok,
            costoUsd: usd,
            costoMxn: mxn,
            usdMxnRate: USD_MXN_RATE,
            status: 'ok',
            latenciaMs: Date.now() - startTime,
        });

        void recordMetric({
            userId,
            endpoint: '/api/agent/advanced/build',
            model: model.id,
            tokensInput: inTok,
            tokensOutput: outTok,
            latencyMs: Date.now() - startTime,
            status: 'ok',
            extra: { idReporte, costoUsd: usd, costoMxn: mxn },
        });

        return NextResponse.json({
            idReporte,
            url: `${VIEWER_BASE}/${idReporte}`,
            title: name,
            overwrite,
            cost: { tokensInput: inTok, tokensOutput: outTok, costUsd: usd, costMxn: mxn, usdMxnRate: USD_MXN_RATE },
        });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Error creando el reporte' }, { status: 500 });
    }
}
