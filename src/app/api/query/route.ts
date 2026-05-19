import { NextResponse } from 'next/server';
import { openai } from '@/lib/ai';
import { anthropic, DEFAULT_MODEL } from '@/lib/anthropic';
import { query } from '@/lib/db';
import { reportsCatalogForPrompt, AVAILABLE_REPORTS } from '@/lib/available-reports';
import { assertReadOnly } from '@/lib/sql-sandbox';
import { createSseStream, SSE_HEADERS } from '@/lib/sse';
import { proposeFollowUp } from '@/lib/investigator';
import { queryLimiter } from '@/lib/rate-limit';
import { getUserId } from '@/lib/conversations';
import { recordMetric } from '@/lib/metrics';
import { logger } from '@/lib/logger';
import fs from 'fs';
import path from 'path';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

const SECRET_KEY = new TextEncoder().encode(
    process.env.JWT_SECRET || 'your-secret-key-here'
);

const MAX_HISTORY_TURNS = 8;

const ANTHROPIC_TOOLS: any[] = [
    {
        name: 'query_database',
        description: 'Ejecuta análisis sobre la base de datos Nexus (MySQL) para responder preguntas de negocio. Solo SELECT.',
        input_schema: {
            type: 'object',
            properties: {
                sql: { type: 'string', description: 'Consulta MySQL optimizada (SELECT/WITH). Usa joins, agregaciones y CTEs.' }
            },
            required: ['sql']
        }
    },
    {
        name: 'suggest_reports',
        description: 'Recomienda reportes existentes del portal cuando aplique para profundizar el análisis.',
        input_schema: {
            type: 'object',
            properties: {
                main_insight: { type: 'string', description: 'Hallazgo principal que motiva las recomendaciones' },
                recommended_reports: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            report_name: { type: 'string' },
                            reason: { type: 'string' },
                            expected_action: { type: 'string' }
                        },
                        required: ['report_name', 'reason']
                    }
                }
            },
            required: ['main_insight', 'recommended_reports']
        }
    },
    {
        name: 'request_clarification',
        description: 'Pide aclaración solo cuando haya ambigüedad real (sin período, sin alcance) y no se pueda inferir.',
        input_schema: {
            type: 'object',
            properties: {
                message: { type: 'string' },
                suggested_questions: {
                    type: 'array',
                    items: { type: 'string' }
                }
            },
            required: ['message', 'suggested_questions']
        }
    }
];

interface IncomingTurn {
    role: 'user' | 'assistant';
    content: string;
}

function buildSystemPrompt(opts: { schemaString: string; customSchemasString: string; formattedRules: string; currentDateTime: string }): string {
    return `Eres Nexus IA, consultor senior conversacional para Nexus.
Tienes acceso de SOLO LECTURA a la base de datos del negocio (MySQL) y puedes
ejecutar consultas para analizar ventas, sucursales, productos, profesores y operación.

Eres un agente versátil estilo Claude: puedes responder cualquier pregunta
(técnica, conceptual, código, ideas), no estás limitado a temas del negocio.
Cuando la pregunta involucra datos, activas tus herramientas; cuando no,
conversas normalmente.

FECHA Y HORA ACTUAL: ${opts.currentDateTime}

──────────────────────────────────────────────────────────────
MEMORIA CONVERSACIONAL
──────────────────────────────────────────────────────────────
Recibes el historial reciente. Úsalo para:
• Refinamientos cortos ("¿y por sucursal?", "ahora del mes pasado") →
  hereda contexto del turno previo sin pedir aclaración
• Mantener consistencia de período/alcance a lo largo de la charla
• No repetir información ya dada recientemente

──────────────────────────────────────────────────────────────
SEGURIDAD ABSOLUTA (no negociable)
──────────────────────────────────────────────────────────────
NUNCA generes SQL que modifique datos. PROHIBIDO:
INSERT, UPDATE, DELETE, REPLACE, MERGE, TRUNCATE, DROP, CREATE, ALTER,
CALL, GRANT, REVOKE, LOAD DATA, múltiples statements separados por ';'.
Si el usuario pide modificar algo, responde con texto explicando que
solo puedes consultar, nunca cambiar.

──────────────────────────────────────────────────────────────
CUÁNDO USAR HERRAMIENTAS vs RESPONDER DIRECTO
──────────────────────────────────────────────────────────────

NO uses herramientas cuando:
• Saludo o charla casual
• Conceptos generales ("¿qué es ticket promedio?")
• Explicaciones, definiciones, ayuda con código
• Preguntas filosóficas, opiniones, brainstorming
• Sobre la app (cómo navegar, qué reportes existen)

SÍ usa query_database cuando:
• El usuario pide datos concretos ("ventas de hoy", "top productos")
• Comparativas reales con números
• Análisis cuantitativo

USA suggest_reports cuando exista un reporte preexistente que respondería mejor
que correr SQL desde cero.

USA request_clarification SOLO si la consulta de datos es genuinamente ambigua
y NO puedes inferir razonablemente.

──────────────────────────────────────────────────────────────
CONTEXTO DEL NEGOCIO (ESQUEMA)
──────────────────────────────────────────────────────────────
${opts.schemaString}

${opts.customSchemasString}

${reportsCatalogForPrompt()}

REGLAS DINÁMICAS DE NEGOCIO:
${opts.formattedRules}

──────────────────────────────────────────────────────────────
MySQL PRECISO (cuando ejecutes consultas)
──────────────────────────────────────────────────────────────
• Solo SELECT y WITH (CTE)
• Identificadores con espacios entre backticks: \`nombre col\`
• Funciones de fecha MySQL: CURDATE(), NOW(), DATE_SUB, DATE_FORMAT, YEAR(), MONTH(), DAY(), HOUR()
• NULL-safe: IFNULL(x, 0). NUNCA inventes columnas — usa SOLO las del esquema
• Tabla principal: tblVentas (FechaVenta DATETIME, Total DOUBLE, IdSucursal, IdCliente, IdUsuario)
• CLIENTES Y PROVEEDORES: Ambos están consolidados en \`tblSocios\` (el nombre del socio/cliente/proveedor está en la columna \`Socio\`).
  - Cuando pregunten por "cliente" (Client/Customer), relaciónalo con \`tblSocios\` (generalmente mediante \`tblVentas.IdSocio = tblSocios.IdSocio\` o buscando en \`tblSocios\` donde \`EsProveedor = 0\`).
  - Cuando pregunten por "proveedor" (Supplier/Vendor), relaciónalo con \`tblSocios\` donde \`EsProveedor = 1\` (generalmente mediante \`tblArticulos.IdProveedor = tblSocios.IdSocio\` o \`tblOrdenesCompra.IdProveedor = tblSocios.IdSocio\`).
• Detalle: tblDetalleVentas (IdVenta, IdArticulo, Cantidad, PrecioBase, Total)
• Sucursales: tblSucursales (Nombre)
• Artículos: tblArticulos (Producto, Depto)
• Si hay mes sin año explícito → asume año actual
• Tendencia sin período → últimos 30 días
• Para top N usa LIMIT, no TOP

──────────────────────────────────────────────────────────────
ESTILO DE RESPUESTA
──────────────────────────────────────────────────────────────
REGISTRO: Profesional pero humano. Consultor senior amigable. Sin robot, sin
corporativo acartonado, sin emojis salvo que el usuario los use primero.

LONGITUD: CORTA. 2-4 oraciones para datos. Solo extender si piden explicación.

FORMATO: Métricas inline en prosa, en **negritas**. Sin tablas obligatorias.

CORRECTO:
"Las ventas de hoy van en **$1.4M**, 8% arriba de ayer. Centro tira del carro
con **$420K**, seguido por Norte (**$310K**)."

INCORRECTO:
"Aquí los datos:
• Total: $1.4M
• Centro: $420K"

NO HACER:
✗ Bullets de datos numéricos simples
✗ Encabezados "Resumen:" "Hallazgos:" dentro del texto
✗ Repetir la pregunta al inicio
✗ "Voy a..." "Permíteme..." → actúa directo

SÍ HACER:
✓ Respuesta directa en prosa fluida con métricas inline
✓ Para no-datos, responde como Claude estándar, sin tools
✓ Menciona en una frase cualquier anomalía notable
✓ Cierra con la respuesta misma, sin "¿quieres profundizar?"
`;
}

async function fetchAiRules(prompt: string): Promise<string> {
    try {
        const rules = await query(`
            SELECT
                CONCAT(B.Consecutivo, '.', IFNULL(A.Consecutivo, 0)) as RuleId,
                Regla,
                B.PalabraClave as MatchedWord
            FROM tblReglasPalabrasClave A
            INNER JOIN tblPalabrasClave B ON A.IdPalabraClave = B.IdPalabraClave
            WHERE A.Status = 0 AND B.Status = 0 AND (B.Consecutivo = 1 OR (
                EXISTS (
                    SELECT 1
                    FROM (SELECT ? as prompt) AS sub
                    WHERE prompt LIKE CONCAT('%', B.PalabraClave, '%')
                )
                AND B.Consecutivo > 1
            ))
            ORDER BY B.Consecutivo, A.Consecutivo
        `, [prompt]);
        return (rules as any[]).map(r => `- ${r.RuleId} ${r.Regla}`).join('\n');
    } catch {
        return '';
    }
}

async function logQuestion(prompt: string, response: any, sql: string | null): Promise<void> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('session');
        let userId = 'unknown';
        if (token) {
            const { payload } = await jwtVerify(token.value, SECRET_KEY);
            userId = String((payload as any).id || 'unknown');
        }
        await query(
            'INSERT INTO tblLogPreguntas (Pregunta, Resultado, FechaPregunta, IdUsuario, Error, ConsultaSQL) VALUES (?, ?, NOW(), ?, 0, ?)',
            [prompt, JSON.stringify(response).slice(0, 16000), userId, sql]
        );
    } catch (e) {
        // Silencioso
    }
}

export async function POST(req: Request) {
    let prompt = 'Unknown Prompt';
    let lastSql: string | null = null;
    let selectedModel = DEFAULT_MODEL;
    const startTime = Date.now();
    const requestId = `req_${startTime.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const log = logger.child({ requestId });

    try {
        // Rate limit
        const userIdForLimit = await getUserId().catch(() => 'anonymous');
        const limit = queryLimiter.check(`query:${userIdForLimit}`);
        if (!limit.allowed) {
            void recordMetric({
                userId: userIdForLimit,
                endpoint: '/api/query',
                status: 'rate_limited',
                latencyMs: Date.now() - startTime,
                errorMsg: `Bloqueado por rate limit (${Math.ceil(limit.retryAfterMs / 1000)}s)`,
                extra: { requestId }
            });
            log.warn('rate-limited', { user: userIdForLimit });
            return NextResponse.json({
                error: `Demasiadas consultas. Intenta de nuevo en ${Math.ceil(limit.retryAfterMs / 1000)}s.`,
                retry_after_ms: limit.retryAfterMs
            }, {
                status: 429,
                headers: {
                    'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)),
                    'X-RateLimit-Remaining': '0'
                }
            });
        }

        const body = await req.json();
        prompt = body.prompt;
        selectedModel = body.model || DEFAULT_MODEL;
        const rawHistory: IncomingTurn[] = Array.isArray(body.history) ? body.history : [];

        if (!prompt) {
            return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
        }

        const conversationHistory = rawHistory
            .filter(t => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim())
            .slice(-MAX_HISTORY_TURNS * 2)
            .map(t => ({
                role: t.role,
                content: t.content.length > 4000 ? t.content.slice(0, 4000) + '…' : t.content
            }));

        while (conversationHistory.length > 0 && conversationHistory[0].role !== 'user') {
            conversationHistory.shift();
        }

        const messagesForModel = [...conversationHistory, { role: 'user' as const, content: prompt }];

        const schemaPath = path.join(process.cwd(), 'database-schema-ia.md');
        const schemaString = fs.readFileSync(schemaPath, 'utf-8');
        
        // Read custom query designer schemas and prompt injection
        let customSchemasString = '';
        try {
            const customSchemasPath = path.join(process.cwd(), 'src', 'data', 'custom-query-schemas.json');
            if (fs.existsSync(customSchemasPath)) {
                const customRaw = fs.readFileSync(customSchemasPath, 'utf-8');
                const customSchemas = JSON.parse(customRaw);
                if (Array.isArray(customSchemas) && customSchemas.length > 0) {
                    customSchemasString = '\n\nESQUEMAS DE CONSULTA Y RELACIONES ADICIONALES (DISEÑADOS POR USUARIO):\n';
                    customSchemasString += '===================================================================\n';
                    customSchemas.forEach(schema => {
                        customSchemasString += `\n### Contexto de consulta: ${schema.name}\n`;
                        customSchemasString += `Descripción: ${schema.description}\n`;
                        customSchemasString += `Tablas a usar: ${schema.tables?.join(', ') || ''}\n`;
                        if (schema.relationships && schema.relationships.length > 0) {
                            customSchemasString += `Reglas de Join / Relaciones:\n`;
                            schema.relationships.forEach((rel: any) => {
                                if (rel.fieldPairs && Array.isArray(rel.fieldPairs) && rel.fieldPairs.length > 0) {
                                    const joinConditions = rel.fieldPairs
                                        .map((pair: any) => `${rel.tableA}.${pair.fieldA} = ${rel.tableB}.${pair.fieldB}`)
                                        .join(' AND ');
                                    customSchemasString += `  - Join ${rel.joinType || 'INNER JOIN'}: ON ${joinConditions}\n`;
                                } else {
                                    // Fallback for single-field schema structure
                                    customSchemasString += `  - Join ${rel.joinType || 'INNER JOIN'}: ON ${rel.tableA}.${rel.fieldA} = ${rel.tableB}.${rel.fieldB}\n`;
                                }
                            });
                        }
                        if (schema.fieldDescriptions && Object.keys(schema.fieldDescriptions).length > 0) {
                            customSchemasString += `Glosario de campos y reglas de negocio:\n`;
                            Object.entries(schema.fieldDescriptions).forEach(([fieldKey, desc]) => {
                                if (desc) {
                                    customSchemasString += `  - Campo ${fieldKey}: ${desc}\n`;
                                }
                            });
                        }
                    });
                }
            }
        } catch (err) {
            console.error('Error loading custom schemas for AI Agent:', err);
        }

        const formattedRules = await fetchAiRules(prompt);
        const currentDateTime = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
        const systemPrompt = buildSystemPrompt({ 
            schemaString, 
            customSchemasString, 
            formattedRules, 
            currentDateTime 
        });

        const url = new URL(req.url);
        const wantsStreaming = url.searchParams.get('stream') === 'true';
        const isAnthropic = selectedModel.includes('claude');

        // ───────────────────────────── STREAMING ─────────────────────────────
        if (wantsStreaming && isAnthropic) {
            const stream = createSseStream(async (emit) => {
                try {
                    emit({ event: 'status', data: { phase: 'thinking' } });

                    const decision = await anthropic.messages.create({
                        model: selectedModel,
                        max_tokens: 4096,
                        system: systemPrompt,
                        messages: messagesForModel,
                        tools: ANTHROPIC_TOOLS,
                        tool_choice: { type: 'auto' }
                    });

                    const textBlock = decision.content.find((c: any) => c.type === 'text') as any;
                    const initialText = textBlock?.text || '';
                    const toolUses = decision.content.filter((c: any) => c.type === 'tool_use') as any[];

                    if (toolUses.length === 0) {
                        const text = initialText.trim() ||
                            'Estoy aquí. Cuéntame qué necesitas — puedo darte el pulso del negocio o ayudarte con cualquier otra pregunta.';
                        emit({ event: 'text-delta', data: { text } });
                        emit({ event: 'metadata', data: { conversational: true, ai_model: selectedModel } });
                        emit({ event: 'done', data: {} });
                        await logQuestion(prompt, { message: text, conversational: true }, null);
                        return;
                    }

                    const toolCall = toolUses[0];
                    const args = toolCall.input;

                    if (toolCall.name === 'request_clarification') {
                        emit({
                            event: 'clarification',
                            data: {
                                message: args.message,
                                suggested_questions: args.suggested_questions,
                                ai_model: selectedModel
                            }
                        });
                        emit({ event: 'done', data: {} });
                        await logQuestion(prompt, { message: args.message, clarification: true }, null);
                        return;
                    }

                    if (toolCall.name === 'suggest_reports') {
                        const msg = `${args.main_insight}\n\nReportes que pueden ayudarte:`;
                        emit({ event: 'text-delta', data: { text: msg } });
                        emit({
                            event: 'metadata',
                            data: {
                                ai_model: selectedModel,
                                suggested_reports: args.recommended_reports,
                                suggested_questions: args.recommended_reports.map((r: any) => r.report_name)
                            }
                        });
                        emit({ event: 'done', data: {} });
                        await logQuestion(prompt, { message: msg, suggested_reports: args.recommended_reports }, null);
                        return;
                    }

                    if (toolCall.name === 'query_database') {
                        let safeSql: string;
                        try {
                            safeSql = assertReadOnly(args.sql);
                        } catch (sandboxErr: any) {
                            emit({
                                event: 'error',
                                data: {
                                    message: 'Consulta bloqueada por el sandbox: este agente solo puede leer datos.',
                                    details: sandboxErr.message
                                }
                            });
                            emit({ event: 'done', data: {} });
                            return;
                        }

                        lastSql = safeSql;
                        emit({ event: 'status', data: { phase: 'querying' } });

                        let results: any[] = [];
                        try {
                            results = await query(safeSql);
                        } catch (sqlErr: any) {
                            emit({
                                event: 'error',
                                data: { message: 'Error ejecutando la consulta', details: sqlErr.message }
                            });
                            emit({ event: 'done', data: {} });
                            return;
                        }

                        emit({ event: 'status', data: { phase: 'analyzing' } });

                        const analysisPayload = await runStructuredAnalysis({
                            model: selectedModel,
                            prompt,
                            sql: safeSql,
                            results
                        });

                        emit({ event: 'text-delta', data: { text: analysisPayload.text } });

                        // Modo investigador (opcional, una sola query extra)
                        let followUp = null;
                        try {
                            followUp = await proposeFollowUp({
                                userPrompt: prompt,
                                firstSql: safeSql,
                                firstResults: results,
                                schemaContext: schemaString,
                                model: selectedModel
                            });
                        } catch { }

                        const visualization = analysisPayload.visualization || inferVisualization(prompt, results);

                        emit({
                            event: 'metadata',
                            data: {
                                ai_model: selectedModel,
                                sql: safeSql,
                                data: results,
                                visualization,
                                follow_up: followUp,
                                key_insights: analysisPayload.key_insights,
                                recommendations: analysisPayload.recommendations,
                                suggested_reports: analysisPayload.suggested_reports,
                                suggested_questions: analysisPayload.suggested_questions?.length
                                    ? analysisPayload.suggested_questions
                                    : buildSuggestedFollowups(prompt, results)
                            }
                        });
                        emit({ event: 'done', data: {} });

                        await logQuestion(prompt, { message: analysisPayload.text, sql: safeSql, rows: results.length }, safeSql);
                        void recordMetric({
                            userId: userIdForLimit,
                            endpoint: '/api/query',
                            model: selectedModel,
                            streaming: true,
                            status: 'ok',
                            latencyMs: Date.now() - startTime,
                            tokensInput: decision.usage?.input_tokens,
                            tokensOutput: decision.usage?.output_tokens,
                            extra: { requestId, rows: results.length }
                        });
                        return;
                    }
                } catch (err: any) {
                    log.error('streaming error', { msg: err?.message });
                    emit({ event: 'error', data: { message: err?.message || 'Error interno' } });
                    emit({ event: 'done', data: {} });
                    void recordMetric({
                        userId: userIdForLimit,
                        endpoint: '/api/query',
                        model: selectedModel,
                        streaming: true,
                        status: 'error',
                        latencyMs: Date.now() - startTime,
                        errorMsg: err?.message,
                        extra: { requestId }
                    });
                }
            });

            return new Response(stream, { headers: SSE_HEADERS });
        }

        // ───────────────────────────── NON-STREAMING (JSON) ─────────────────────────────
        let message: any;
        let toolCalls: any[] = [];
        let inputTokens: number | undefined;
        let outputTokens: number | undefined;

        if (isAnthropic) {
            try {
                const response = await anthropic.messages.create({
                    model: selectedModel,
                    max_tokens: 4096,
                    system: systemPrompt,
                    messages: messagesForModel,
                    tools: ANTHROPIC_TOOLS,
                    tool_choice: { type: 'auto' }
                });
                inputTokens = response.usage?.input_tokens;
                outputTokens = response.usage?.output_tokens;
                const textBlock = response.content.find((c: any) => c.type === 'text') as any;
                message = { text: textBlock?.text || '' };
                toolCalls = response.content.filter((c: any) => c.type === 'tool_use').map((t: any) => ({
                    id: t.id,
                    name: t.name,
                    args: t.input
                }));
            } catch (err: any) {
                log.warn('Anthropic call failed, falling back to OpenAI', { error: err?.message });
                selectedModel = 'gpt-4o';
            }
        }

        if (!message) {
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...messagesForModel.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
                ],
                tools: ANTHROPIC_TOOLS.map(t => ({
                    type: 'function' as const,
                    function: {
                        name: t.name,
                        description: t.description,
                        parameters: t.input_schema
                    }
                })),
                tool_choice: 'auto',
                temperature: 0,
                parallel_tool_calls: false
            });
            const openaiMsg = completion.choices[0].message;
            message = { text: openaiMsg.content || '' };
            toolCalls = (openaiMsg.tool_calls || []).map((t: any) => ({
                id: t.id,
                name: t.function.name,
                args: JSON.parse(t.function.arguments)
            }));
            inputTokens = completion.usage?.prompt_tokens;
            outputTokens = completion.usage?.completion_tokens;
        }

        let finalResponse: any;

        if (toolCalls.length === 0) {
            finalResponse = {
                data: [],
                message: message.text?.trim() || 'Estoy aquí. ¿En qué te apoyo?',
                visualization: 'table',
                suggested_questions: ['Ventas de hoy', 'Top 5 productos del mes', 'Comparativa por sucursal']
            };
        } else {
            const toolCall = toolCalls[0];
            const args = toolCall.args;

            if (toolCall.name === 'request_clarification') {
                finalResponse = {
                    data: [],
                    sql: null,
                    message: args.message,
                    visualization: 'table',
                    suggested_questions: args.suggested_questions
                };
            } else if (toolCall.name === 'suggest_reports') {
                finalResponse = {
                    data: [],
                    sql: null,
                    message: args.main_insight,
                    visualization: 'table',
                    suggested_reports: args.recommended_reports,
                    suggested_questions: args.recommended_reports.map((r: any) => r.report_name)
                };
            } else if (toolCall.name === 'query_database') {
                let safeSql: string;
                try {
                    safeSql = assertReadOnly(args.sql);
                } catch (sandboxErr: any) {
                    void recordMetric({
                        userId: userIdForLimit,
                        endpoint: '/api/query',
                        model: selectedModel,
                        status: 'blocked',
                        latencyMs: Date.now() - startTime,
                        errorMsg: sandboxErr.message,
                        extra: { requestId }
                    });
                    return NextResponse.json({
                        error: 'Consulta bloqueada por el sandbox',
                        details: sandboxErr.message
                    }, { status: 400 });
                }

                lastSql = safeSql;
                let results: any[] = [];
                try {
                    results = await query(safeSql);
                } catch (sqlErr: any) {
                    // Auto-corrección rápida con el mismo modelo
                    try {
                        const correction = await openai.chat.completions.create({
                            model: 'gpt-4o',
                            messages: [
                                { role: 'system', content: `Error MySQL: ${sqlErr.message}. Corrige el SQL. Solo devuelve el SQL corregido sin markdown.` },
                                { role: 'user', content: safeSql }
                            ]
                        });
                        const corrected = correction.choices[0].message.content?.replace(/```sql|```/g, '').trim() || safeSql;
                        const safeCorrected = assertReadOnly(corrected);
                        lastSql = safeCorrected;
                        results = await query(safeCorrected);
                    } catch (e: any) {
                        throw new Error(`SQL error: ${sqlErr.message}`);
                    }
                }

                const analysisPayload = await runStructuredAnalysis({
                    model: selectedModel.includes('claude') ? selectedModel : DEFAULT_MODEL,
                    prompt,
                    sql: lastSql || safeSql,
                    results
                });
                finalResponse = {
                    data: results,
                    sql: lastSql,
                    message: analysisPayload.text,
                    visualization: analysisPayload.visualization || inferVisualization(prompt, results),
                    key_insights: analysisPayload.key_insights,
                    recommendations: analysisPayload.recommendations,
                    suggested_reports: analysisPayload.suggested_reports,
                    suggested_questions: analysisPayload.suggested_questions?.length
                        ? analysisPayload.suggested_questions
                        : buildSuggestedFollowups(prompt, results),
                    ai_model: selectedModel
                };
            }
        }

        await logQuestion(prompt, finalResponse, lastSql);
        void recordMetric({
            userId: userIdForLimit,
            endpoint: '/api/query',
            model: selectedModel,
            streaming: false,
            status: 'ok',
            latencyMs: Date.now() - startTime,
            tokensInput: inputTokens,
            tokensOutput: outputTokens,
            extra: { requestId, rows: finalResponse.data?.length || 0 }
        });

        return NextResponse.json(finalResponse);
    } catch (error: any) {
        log.error('agent error', { msg: error.message });
        void recordMetric({
            userId: 'unknown',
            endpoint: '/api/query',
            model: selectedModel,
            status: 'error',
            latencyMs: Date.now() - startTime,
            errorMsg: error?.message,
            extra: { requestId }
        });
        return NextResponse.json({
            error: error.message || 'Internal Server Error',
            sql: lastSql
        }, { status: 500 });
    }
}

function inferVisualization(prompt: string, results: any[]): string {
    if (!results || results.length === 0) return 'table';
    const cols = Object.keys(results[0]);
    const lowerPrompt = prompt.toLowerCase();
    if (/tendencia|evoluci[oó]n|histor|por d[ií]a|por mes|por hora/i.test(lowerPrompt)) return 'line';
    if (/comparativa|comparar|vs|ranking|top \d+|por sucursal/i.test(lowerPrompt)) return 'bar';
    if (/distribuci[oó]n|porcentaje|participaci[oó]n|share/i.test(lowerPrompt)) return 'pie';
    if (results.length === 1 && cols.length === 1) return 'kpi';
    return 'table';
}

function buildSuggestedFollowups(_prompt: string, results: any[]): string[] {
    const base = [
        'Compara contra el mismo período del año pasado',
        'Desglose por sucursal',
        'Ver evolución diaria de los últimos 30 días'
    ];
    if (results && results.length > 0) {
        const cols = Object.keys(results[0]);
        if (cols.includes('Sucursal') || cols.includes('IdSucursal')) {
            base[1] = 'Compara contra el promedio de las demás sucursales';
        }
    }
    return base;
}

interface StructuredAnalysis {
    text: string;
    key_insights?: string[];
    recommendations?: string[];
    suggested_reports?: Array<{ report_name: string; reason: string; expected_action?: string; path?: string }>;
    suggested_questions?: string[];
    visualization?: 'table' | 'bar' | 'line' | 'pie' | 'area' | 'kpi';
}

/**
 * Pide a Claude (o OpenAI fallback) una respuesta estructurada con prosa breve
 * + hallazgos + acciones + reportes sugeridos. Una sola llamada que devuelve
 * JSON. Si el modelo falla, regresa al menos el texto crudo.
 */
async function runStructuredAnalysis(opts: {
    model: string;
    prompt: string;
    sql: string;
    results: any[];
}): Promise<StructuredAnalysis> {
    const { model, prompt, sql, results } = opts;

    const reportsList = Object.values(AVAILABLE_REPORTS)
        .flatMap(c => c.reports)
        .map(r => `- ${r.name} (${r.path}) — ${r.description}`)
        .join('\n');

    const instr = `Eres Nexus IA, consultor senior. Acabas de ejecutar una consulta y tienes los resultados.

Genera una respuesta ESTRUCTURADA EN JSON con estos campos:

{
  "text": "Prosa breve (2-4 oraciones) con métricas inline en **negritas**. Tono consultor senior. Sin encabezados, sin bullets, sin 'Aquí tienes:'",
  "key_insights": ["3-5 hallazgos cortos", "cada uno una oración con datos en **negritas**", "lo que llama la atención"],
  "recommendations": ["2-4 acciones concretas y verbo-en-infinitivo", "ej: 'Revisar inventario de X en sucursal Y'", "directas, accionables"],
  "suggested_reports": [
    { "report_name": "Nombre exacto del reporte", "reason": "por qué ayuda aquí", "path": "/dashboard/..." }
  ],
  "suggested_questions": ["Pregunta de seguimiento 1", "Pregunta 2", "Pregunta 3"],
  "visualization": "table|bar|line|pie|area|kpi"
}

REPORTES DISPONIBLES (para suggested_reports, copia name y path TAL CUAL):
${reportsList}

REGLAS:
- "text" es la respuesta principal — debe sonar natural, no robótica
- "key_insights" SOLO cosas notables/llamativas (no obvias). Si nada destaca, devuelve []
- "recommendations" SOLO si los datos sugieren acción clara. Si no, []
- "suggested_reports" SOLO si hay un reporte que el usuario podría visitar. Si no aplica, []
- "visualization" sugiere el mejor formato según los datos (1 fila numérica → "kpi"; serie temporal → "line"; ranking categorías → "bar"; distribución → "pie"; lista larga → "table")

DEVUELVE SOLO EL JSON, sin markdown.

PREGUNTA: ${prompt}
SQL: ${sql}
RESULTADOS (muestra de hasta 20 filas, total ${results.length}): ${JSON.stringify(results.slice(0, 20))}`;

    try {
        if (model.includes('claude')) {
            const resp = await anthropic.messages.create({
                model,
                max_tokens: 2500,
                messages: [{ role: 'user', content: instr }]
            });
            const text = (resp.content[0] as any)?.text || '';
            return parseStructuredAnalysis(text);
        } else {
            const resp = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [{ role: 'user', content: instr }],
                response_format: { type: 'json_object' }
            });
            const text = resp.choices[0].message.content || '';
            return parseStructuredAnalysis(text);
        }
    } catch (e) {
        console.error('runStructuredAnalysis failed:', e);
        return { text: 'Aquí tienes los datos solicitados.' };
    }
}

function parseStructuredAnalysis(raw: string): StructuredAnalysis {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) {
        return { text: raw.trim() || 'Aquí tienes los datos.' };
    }
    try {
        const parsed = JSON.parse(raw.substring(start, end + 1));
        return {
            text: String(parsed.text || 'Aquí tienes los datos.').slice(0, 4000),
            key_insights: Array.isArray(parsed.key_insights) ? parsed.key_insights.slice(0, 6).map((x: any) => String(x).slice(0, 300)) : [],
            recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 6).map((x: any) => String(x).slice(0, 300)) : [],
            suggested_reports: Array.isArray(parsed.suggested_reports)
                ? parsed.suggested_reports.slice(0, 4).map((r: any) => ({
                    report_name: String(r.report_name || '').slice(0, 100),
                    reason: String(r.reason || '').slice(0, 200),
                    expected_action: r.expected_action ? String(r.expected_action).slice(0, 200) : undefined,
                    path: r.path ? String(r.path).slice(0, 200) : resolveReportPath(r.report_name)
                }))
                : [],
            suggested_questions: Array.isArray(parsed.suggested_questions)
                ? parsed.suggested_questions.slice(0, 4).map((x: any) => String(x).slice(0, 200))
                : [],
            visualization: ['table', 'bar', 'line', 'pie', 'area', 'kpi'].includes(parsed.visualization) ? parsed.visualization : undefined
        };
    } catch {
        return { text: raw.trim().slice(0, 4000) };
    }
}

function resolveReportPath(name: string): string | undefined {
    if (!name) return undefined;
    const lower = name.toLowerCase();
    for (const cat of Object.values(AVAILABLE_REPORTS)) {
        for (const r of cat.reports) {
            if (r.name.toLowerCase() === lower) return r.path;
        }
    }
    return undefined;
}
