import { NextResponse } from 'next/server';
import { openai } from '@/lib/ai';
import { anthropic, DEFAULT_MODEL } from '@/lib/anthropic';
import { query } from '@/lib/db';
import { reportsCatalogForPrompt, AVAILABLE_REPORTS, findRelevantReports } from '@/lib/available-reports';
import { assertReadOnly } from '@/lib/sql-sandbox';
import { createSseStream, SSE_HEADERS } from '@/lib/sse';
import { proposeFollowUp, FollowUpProposal } from '@/lib/investigator';
import {
    detectCausalIntent,
    generateHypotheses,
    executeHypotheses,
    generateDeepDive,
    formatHypothesesForPrompt,
    CausalHypothesisResult
} from '@/lib/causal-reasoner';
import {
    detectForecastIntent,
    rowsToSeries,
    forecastSeries,
    formatForecastForPrompt,
    ForecastResult
} from '@/lib/forecasting';
import { saveMemory } from '@/lib/semantic-memory';
import { findRelevantPlaybookSteps } from '@/lib/playbooks';
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
const META_MARKER = '---NEXUS_META---';

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
                main_insight: { type: 'string' },
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
• CLIENTES Y PROVEEDORES: Ambos están consolidados en \`tblSocios\` (Socio es el nombre).
  - "cliente" → \`tblSocios\` (típicamente \`tblVentas.IdSocio = tblSocios.IdSocio\` o \`EsProveedor = 0\`)
  - "proveedor" → \`tblSocios\` donde \`EsProveedor = 1\`
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
        // silencioso
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

interface FollowUpContext {
    question: string;
    sql: string | null;
    results: any[];
}

function buildMetaPrompt(
    prompt: string,
    sql: string | null,
    results: any[],
    followUp?: FollowUpContext | null,
    causalResults?: CausalHypothesisResult[] | null,
    forecastResult?: ForecastResult | null
): string {
    const forecastSection = forecastResult ? formatForecastForPrompt(forecastResult) : '';

    const followUpSection = followUp && followUp.results.length > 0 ? `

INVESTIGACIÓN AUTOMÁTICA EJECUTADA:
Detectaste algo anómalo en la primera consulta y ejecutaste una segunda para
profundizar. Integra AMBAS en tu análisis — no las trates como separadas.
Tu respuesta debe contar la historia completa: el dato inicial + lo que
descubriste al investigar.

Pregunta de la investigación: ${followUp.question}
SQL de la investigación: ${followUp.sql}
Resultados (primeros 10): ${JSON.stringify(followUp.results.slice(0, 10))}
` : '';

    const subCount = (causalResults || []).filter(r => r.label.startsWith('↳')).length;
    const baseCount = (causalResults?.length || 0) - subCount;
    const causalSection = causalResults && causalResults.length > 0 ? `

RAZONAMIENTO CAUSAL MULTI-HIPÓTESIS:
La pregunta es de tipo "¿por qué pasó X?". Ejecutaste ${baseCount} hipótesis
principales en paralelo${subCount > 0 ? ` y ${subCount} sub-hipótesis de profundización` : ''}
para investigar la causa raíz. Cada hipótesis viene con un VEREDICTO PRELIMINAR
calculado heurísticamente (concentración y varianza de los datos).

Tu trabajo:
1. CONFÍA en el veredicto preliminar pero VERIFÍCALO mirando los datos crudos.
   Hipótesis ordenadas: primero "EVIDENCIA FUERTE", luego "PARCIAL", luego "SIN EVIDENCIA".
2. CONCLUYE con la causa raíz más probable, fundamentada en las hipótesis con
   evidencia fuerte/parcial.${subCount > 0 ? `
3. Las sub-hipótesis ("↳") profundizan en la dimensión concentrada. Úsalas para
   dar especificidad ("la causa es X, y dentro de X específicamente Y").` : ''}

INSTRUCCIONES PARA EL TEXTO DE LA PARTE 1:
- Permitido extenderse a 5-7 oraciones (es un análisis de causa raíz)
- Estructura: dato principal → causa identificada con evidencia → 1-2 hipótesis
  descartadas brevemente → 1 acción accionable
- Sé contundente con "EVIDENCIA FUERTE": "la causa es X" no "podría ser X".

INSTRUCCIONES PARA "key_insights":
- Lista las 3 HIPÓTESIS MÁS RELEVANTES con su veredicto: "Confirmada", "Parcial"
  o "Descartada", acompañada del dato concreto que lo prueba.

HIPÓTESIS EJECUTADAS (ordenadas por fuerza de evidencia):
${formatHypothesesForPrompt(causalResults)}
` : '';

    const isCausal = !!(causalResults && causalResults.length > 0);
    const sentenceRange = isCausal ? '5-7 oraciones (análisis de causa raíz)'
        : followUp ? '4-6 oraciones (con investigación)'
            : '2-4 oraciones';

    const reportsList = Object.values(AVAILABLE_REPORTS)
        .flatMap(c => c.reports)
        .map(r => `- ${r.name} (${r.path}) — ${r.description}`)
        .join('\n');

    return `Eres Nexus IA, consultor senior conversacional. Acabas de ejecutar una consulta
y tienes los resultados. Vas a responder en DOS partes separadas por un marcador.

PARTE 1 — Texto en prosa fluida (lo primero que verá el usuario):
• ${sentenceRange} máximo
• Cifras INLINE con **negritas Markdown** (ej: "**$1.4M**", "**+12%**")
• Tono: consultor amigable, no robótico
• NO bullets, NO encabezados, NO repitas la pregunta
• NO digas "¿quieres profundizar?" — los botones ya aparecen en la UI
${followUp ? '• Menciona el hallazgo principal Y lo que reveló la investigación, como una sola narrativa fluida' : ''}
${isCausal ? '• Concluye con la causa raíz más probable y 1 acción accionable' : ''}

DESPUÉS DEL TEXTO, en una nueva línea, escribe EXACTAMENTE este marcador:
${META_MARKER}

PARTE 2 — Debajo del marcador, un JSON válido (y nada más):
{
  "key_insights": ["3 hallazgos cortos con dato concreto"],
  "recommendations": ["2-3 acciones priorizadas"],
  "visualization": "table|bar|line|pie|area|kpi",
  "suggested_questions": ["3 preguntas de seguimiento naturales"],
  "suggested_reports": [
    { "report_name": "Nombre exacto del reporte", "reason": "por qué ayuda", "path": "/dashboard/..." }
  ]
}

REPORTES DISPONIBLES (para suggested_reports — copia name/path TAL CUAL):
${reportsList}

REGLAS DE VISUALIZACIÓN:
• line/area → series temporales
• bar → comparativas entre categorías
• pie → distribuciones porcentuales
• table → datos multi-columna de detalle
• kpi → una sola métrica clave

──────────────────────────────────────────────
Pregunta del usuario: ${prompt}
SQL ejecutado: ${sql}
Resultados (primeros 10): ${JSON.stringify(results.slice(0, 10))}${followUpSection}${causalSection}${forecastSection}
──────────────────────────────────────────────

Empieza la respuesta directamente, sin preámbulos.`;
}

function parseMetaBlock(raw: string): any {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return {};
    try {
        return JSON.parse(raw.substring(start, end + 1));
    } catch {
        return {};
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

function normalizeSuggestedReports(meta: any, prompt: string): any[] {
    if (Array.isArray(meta.suggested_reports) && meta.suggested_reports.length > 0) {
        return meta.suggested_reports.slice(0, 4).map((r: any) => ({
            report_name: String(r.report_name || '').slice(0, 100),
            reason: String(r.reason || '').slice(0, 200),
            expected_action: r.expected_action ? String(r.expected_action).slice(0, 200) : undefined,
            path: r.path ? String(r.path).slice(0, 200) : resolveReportPath(r.report_name)
        }));
    }
    const relevant = findRelevantReports(prompt);
    if (relevant.length === 0) return [];
    return relevant.slice(0, 3).map(item => ({
        report_name: item.report.name,
        reason: item.report.description,
        expected_action: item.report.useCases[0],
        path: item.report.path
    }));
}

export async function POST(req: Request) {
    let prompt = 'Unknown Prompt';
    let lastSql: string | null = null;
    let selectedModel = DEFAULT_MODEL;
    const startTime = Date.now();
    const requestId = `req_${startTime.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const log = logger.child({ requestId });

    try {
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
            console.error('Error loading custom schemas:', err);
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
            let streamOutcome: 'ok' | 'error' = 'ok';
            let streamError: string | undefined;

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

                    // CASO A: sin tool — respuesta conversacional
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

                    // CASO B: request_clarification
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

                    // CASO C: suggest_reports
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

                    // CASO D: query_database
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
                            emit({ event: 'status', data: { phase: 'correcting-sql' } });
                            try {
                                const correction = await anthropic.messages.create({
                                    model: selectedModel,
                                    max_tokens: 1024,
                                    messages: [{
                                        role: 'user',
                                        content: `Error MySQL: ${sqlErr.message}. Corrige el SQL. Solo devuelve el SQL corregido sin markdown.\n\nSQL Original: ${safeSql}`
                                    }]
                                });
                                const corrected = (correction.content[0] as any).text.replace(/```sql|```/g, '').trim();
                                const safeCorrected = assertReadOnly(corrected);
                                lastSql = safeCorrected;
                                results = await query(safeCorrected);
                            } catch (e) {
                                emit({
                                    event: 'error',
                                    data: { message: 'Error ejecutando la consulta', details: sqlErr.message }
                                });
                                emit({ event: 'done', data: {} });
                                return;
                            }
                        }

                        // BRANCH: causal vs investigador
                        const isCausal = detectCausalIntent(prompt);

                        // FORECASTING (independiente de causal)
                        let forecastResult: ForecastResult | null = null;
                        const forecastIntent = detectForecastIntent(prompt);
                        if (forecastIntent.wants && results.length >= 7) {
                            try {
                                const series = rowsToSeries(results);
                                if (series.length >= 7) {
                                    emit({
                                        event: 'status',
                                        data: {
                                            phase: 'analyzing',
                                            detail: `Proyectando ${forecastIntent.daysAhead} días…`
                                        }
                                    });
                                    forecastResult = forecastSeries(series, forecastIntent.daysAhead);
                                }
                            } catch (fe) {
                                console.error('Forecast failed:', fe);
                            }
                        }

                        let followUp: FollowUpProposal | null = null;
                        let followUpResults: any[] = [];
                        let followUpSql: string | null = null;
                        let causalResults: CausalHypothesisResult[] = [];

                        if (isCausal && results.length > 0) {
                            // MODO CAUSAL: 4-6 hipótesis en paralelo
                            emit({
                                event: 'status',
                                data: { phase: 'reasoning-causal', detail: 'Diseñando hipótesis…' }
                            });
                            try {
                                const playbookHints = await findRelevantPlaybookSteps(
                                    String(userIdForLimit),
                                    prompt
                                ).catch(() => [] as string[]);
                                const hypotheses = await generateHypotheses({
                                    userPrompt: prompt,
                                    schemaContext: schemaString,
                                    firstSql: lastSql,
                                    firstResults: results,
                                    playbookHints
                                });
                                if (hypotheses.length > 0) {
                                    emit({
                                        event: 'status',
                                        data: {
                                            phase: 'reasoning-causal',
                                            detail: `Probando ${hypotheses.length} hipótesis en paralelo…`,
                                            hypothesesCount: hypotheses.length
                                        }
                                    });
                                    causalResults = await executeHypotheses(hypotheses);

                                    // SEGUNDA RONDA: solo la primera 'strong'
                                    const strongParent = causalResults.find(
                                        r => r.success && r.evidence?.verdict === 'strong'
                                    );
                                    if (strongParent) {
                                        emit({
                                            event: 'status',
                                            data: {
                                                phase: 'reasoning-causal',
                                                detail: `Profundizando en "${strongParent.evidence?.topDimension?.value || strongParent.label}"…`
                                            }
                                        });
                                        try {
                                            const subHypotheses = await generateDeepDive({
                                                userPrompt: prompt,
                                                parent: strongParent,
                                                schemaContext: schemaString
                                            });
                                            if (subHypotheses.length > 0) {
                                                const subResults = await executeHypotheses(subHypotheses);
                                                causalResults = [...causalResults, ...subResults];
                                            }
                                        } catch (e) {
                                            console.error('Deep dive failed:', e);
                                        }
                                    }
                                }
                            } catch (e) {
                                console.error('Causal reasoning failed:', e);
                            }
                        } else if (results.length > 0) {
                            // MODO INVESTIGADOR clásico
                            try {
                                followUp = await proposeFollowUp({
                                    userPrompt: prompt,
                                    firstSql: lastSql || '',
                                    firstResults: results,
                                    schemaContext: schemaString,
                                    model: selectedModel
                                });
                            } catch (e) {
                                console.error('Investigator failed:', e);
                            }

                            if (followUp) {
                                emit({
                                    event: 'status',
                                    data: {
                                        phase: 'investigating',
                                        detail: followUp.question,
                                        rationale: followUp.rationale
                                    }
                                });
                                try {
                                    const safeFollowUpSql = assertReadOnly(followUp.sql);
                                    followUpSql = safeFollowUpSql;
                                    followUpResults = await query(safeFollowUpSql);
                                } catch (e) {
                                    console.error('Follow-up query failed:', e);
                                    followUp = null;
                                    followUpSql = null;
                                    followUpResults = [];
                                }
                            }
                        }

                        // Stream del análisis con META_MARKER protocol
                        emit({ event: 'status', data: { phase: 'analyzing' } });

                        const metaPrompt = buildMetaPrompt(
                            prompt,
                            lastSql,
                            results,
                            followUp && followUpResults.length > 0
                                ? { question: followUp.question, sql: followUpSql, results: followUpResults }
                                : null,
                            causalResults.length > 0 ? causalResults : null,
                            forecastResult
                        );

                        const streamResp = anthropic.messages.stream({
                            model: selectedModel,
                            max_tokens: 2500,
                            messages: [{ role: 'user', content: metaPrompt }]
                        });

                        let fullText = '';
                        let inMetadata = false;
                        let metadataBuffer = '';

                        for await (const event of streamResp) {
                            if (event.type === 'content_block_delta' &&
                                (event.delta as any).type === 'text_delta') {
                                const chunk = (event.delta as any).text as string;
                                fullText += chunk;

                                if (!inMetadata) {
                                    const markerIdx = fullText.indexOf(META_MARKER);
                                    if (markerIdx >= 0) {
                                        const preMarker = fullText.substring(0, markerIdx);
                                        const alreadyEmittedLen = fullText.length - chunk.length;
                                        if (markerIdx > alreadyEmittedLen) {
                                            const remainingPre = preMarker.substring(alreadyEmittedLen);
                                            if (remainingPre) {
                                                emit({ event: 'text-delta', data: { text: remainingPre } });
                                            }
                                        }
                                        inMetadata = true;
                                        metadataBuffer = fullText.substring(markerIdx + META_MARKER.length);
                                    } else {
                                        emit({ event: 'text-delta', data: { text: chunk } });
                                    }
                                } else {
                                    metadataBuffer += chunk;
                                }
                            }
                        }

                        const meta = parseMetaBlock(metadataBuffer);

                        const fullSummary = inMetadata
                            ? fullText.substring(0, fullText.indexOf(META_MARKER)).trim()
                            : fullText.trim();

                        const visualization = ['table', 'bar', 'line', 'pie', 'area', 'kpi'].includes(meta.visualization)
                            ? meta.visualization
                            : inferVisualization(prompt, results);

                        emit({
                            event: 'metadata',
                            data: {
                                ai_model: selectedModel,
                                sql: lastSql,
                                data: results,
                                visualization,
                                follow_up: followUp ? {
                                    question: followUp.question,
                                    rationale: followUp.rationale,
                                    sql: followUpSql
                                } : null,
                                causal: causalResults.length > 0 ? {
                                    hypotheses_count: causalResults.length,
                                    strong_count: causalResults.filter(r => r.evidence?.verdict === 'strong').length
                                } : null,
                                forecast: forecastResult,
                                key_insights: Array.isArray(meta.key_insights) ? meta.key_insights.slice(0, 6) : [],
                                recommendations: Array.isArray(meta.recommendations) ? meta.recommendations.slice(0, 6) : [],
                                suggested_reports: normalizeSuggestedReports(meta, prompt),
                                suggested_questions: Array.isArray(meta.suggested_questions) && meta.suggested_questions.length > 0
                                    ? meta.suggested_questions.slice(0, 4)
                                    : buildSuggestedFollowups(prompt, results)
                            }
                        });
                        emit({ event: 'done', data: {} });

                        await logQuestion(prompt, {
                            message: fullSummary,
                            sql: lastSql,
                            rows: results.length,
                            causal: causalResults.length > 0,
                            forecast: !!forecastResult
                        }, lastSql);

                        // Memoria semántica (best-effort)
                        if (lastSql) {
                            void saveMemory({
                                userId: String(userIdForLimit),
                                prompt,
                                response: fullSummary,
                                sql: lastSql,
                                aiModel: selectedModel
                            });
                        }

                        void recordMetric({
                            userId: userIdForLimit,
                            endpoint: '/api/query',
                            model: selectedModel,
                            streaming: true,
                            status: 'ok',
                            latencyMs: Date.now() - startTime,
                            tokensInput: decision.usage?.input_tokens,
                            tokensOutput: decision.usage?.output_tokens,
                            extra: { requestId, rows: results.length, causal: causalResults.length > 0, forecast: !!forecastResult }
                        });
                        return;
                    }
                } catch (err: any) {
                    streamOutcome = 'error';
                    streamError = err?.message || String(err);
                    log.error('streaming error', { msg: streamError });
                    emit({ event: 'error', data: { message: streamError } });
                    emit({ event: 'done', data: {} });
                    void recordMetric({
                        userId: userIdForLimit,
                        endpoint: '/api/query',
                        model: selectedModel,
                        streaming: true,
                        status: 'error',
                        latencyMs: Date.now() - startTime,
                        errorMsg: streamError,
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
                conversational: true,
                ai_model: selectedModel,
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
                    ai_model: selectedModel,
                    suggested_questions: args.suggested_questions
                };
            } else if (toolCall.name === 'suggest_reports') {
                finalResponse = {
                    data: [],
                    sql: null,
                    message: args.main_insight,
                    visualization: 'table',
                    ai_model: selectedModel,
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

                // Non-streaming: simpler, no causal/forecast (keep latency reasonable)
                const metaPrompt = buildMetaPrompt(prompt, lastSql, results);
                let metaContent = '';
                if (selectedModel.includes('claude')) {
                    const metaResp = await anthropic.messages.create({
                        model: selectedModel,
                        max_tokens: 2500,
                        messages: [{ role: 'user', content: metaPrompt }]
                    });
                    metaContent = (metaResp.content[0] as any).text || '';
                } else {
                    const metaResp = await openai.chat.completions.create({
                        model: 'gpt-4o',
                        messages: [{ role: 'user', content: metaPrompt }]
                    });
                    metaContent = metaResp.choices[0].message.content || '';
                }

                const markerIdx = metaContent.indexOf(META_MARKER);
                const summary = markerIdx >= 0 ? metaContent.substring(0, markerIdx).trim() : metaContent.trim();
                const meta = markerIdx >= 0 ? parseMetaBlock(metaContent.substring(markerIdx + META_MARKER.length)) : {};

                finalResponse = {
                    data: results,
                    sql: lastSql,
                    message: summary || 'Análisis completado.',
                    visualization: ['table', 'bar', 'line', 'pie', 'area', 'kpi'].includes(meta.visualization)
                        ? meta.visualization
                        : inferVisualization(prompt, results),
                    key_insights: Array.isArray(meta.key_insights) ? meta.key_insights.slice(0, 6) : [],
                    recommendations: Array.isArray(meta.recommendations) ? meta.recommendations.slice(0, 6) : [],
                    suggested_reports: normalizeSuggestedReports(meta, prompt),
                    suggested_questions: Array.isArray(meta.suggested_questions) && meta.suggested_questions.length > 0
                        ? meta.suggested_questions.slice(0, 4)
                        : buildSuggestedFollowups(prompt, results),
                    ai_model: selectedModel
                };

                // Memoria semántica best-effort
                void saveMemory({
                    userId: String(userIdForLimit),
                    prompt,
                    response: summary,
                    sql: lastSql,
                    aiModel: selectedModel
                });
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
