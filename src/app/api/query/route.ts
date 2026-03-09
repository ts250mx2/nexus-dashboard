import { NextResponse } from 'next/server';
import { openai } from '@/lib/ai';
import { query } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

const SECRET_KEY = new TextEncoder().encode(
    process.env.JWT_SECRET || 'your-secret-key-here'
);

function formatCurrency(value: number) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
}

export async function POST(req: Request) {
    let prompt = 'Unknown Prompt';
    let lastSql: string | null = null;

    try {
        const body = await req.json();
        prompt = body.prompt;

        if (!prompt) {
            return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
        }

        const schemaPath = path.join(process.cwd(), 'database-schema-ia.md');
        const schemaString = fs.readFileSync(schemaPath, 'utf-8');

        // Fetch dynamic AI rules from the database
        const aiRules = await query(`
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

        const formattedRules = aiRules.map((r: any) => `- ${r.RuleId} ${r.Regla}`).join('\n');

        const currentDateTime = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
        const systemPrompt = `
      Eres un Analista de Datos Senior especializado en Business Intelligence y MySQL.
      Tu objetivo es transformar datos crudos en hallazgos estratégicos para el usuario.
      
      FECHA Y HORA ACTUAL: ${currentDateTime}
      
      CONTEXTO DE NEGOCIO:
      ${schemaString}
      
      REGLAS DINÁMICAS:
      ${formattedRules}

      DIRECTIVAS ANALÍTICAS:
      0. **POLÍTICA DE CERO EXPLICACIÓN**: ESTÁ TERMINANTEMENTE PROHIBIDO responder con texto antes o en lugar de una herramienta si hay intención de consulta. NO digas "Voy a preparar la consulta".
      1. **Validación de Periodo Dinámica**: 
         - Si el usuario específica un periodo (ej: "hoy", "este mes"): Ejecuta \`query_database\` inmediatamente.
         - Si el usuario menciona un mes sin año: Asume SIEMPRE el año actual.
         - Si NO especifica periodo: INVOCAR \`request_clarification\`.
      2. **Autonomía**: Nunca preguntes "cómo quieres agrupar". Analiza la intención.
      3. **Insights**: Explica *qué significan* los datos.
      4. **Visualización**: Selecciona siempre la mejor herramienta (table, bar, line, pie, area).
      5. **MySQL Preciso**: Usa nombres de tablas y columnas exactos.
     `;

        const tools: any[] = [
            {
                type: 'function',
                function: {
                    name: 'query_database',
                    description: 'Ejecuta análisis de datos en la base de datos local usando MySQL.',
                    parameters: {
                        type: 'object',
                        properties: {
                            sql: { type: 'string', description: 'La consulta MySQL.' }
                        },
                        required: ['sql']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'request_clarification',
                    description: 'Pide al usuario que aclare el periodo de tiempo si no lo especificó.',
                    parameters: {
                        type: 'object',
                        properties: {
                            message: { type: 'string', description: 'Mensaje amable preguntando por el periodo.' },
                            suggested_questions: {
                                type: 'array',
                                items: { type: 'string' },
                                description: '3 sugerencias con la pregunta original del usuario + el periodo de tiempo.'
                            }
                        },
                        required: ['message', 'suggested_questions']
                    }
                }
            }
        ];

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
            ],
            tools,
            tool_choice: 'auto',
            temperature: 0,
        });

        const message = completion.choices[0].message;
        let finalResponse: any = null;

        if (message.tool_calls && message.tool_calls.length > 0) {
            const toolCall = message.tool_calls[0] as any;
            const args = JSON.parse(toolCall.function.arguments);

            if (toolCall.function.name === 'query_database') {
                lastSql = args.sql;
                let results: any[];
                try {
                    results = await query(args.sql);
                } catch (sqlError: any) {
                    const correctionCompletion = await openai.chat.completions.create({
                        model: 'gpt-4o',
                        messages: [
                            { role: 'system', content: `Error MySQL: ${sqlError.message}. Corrige el SQL.` },
                            { role: 'user', content: args.sql }
                        ]
                    });
                    const correctedSql = correctionCompletion.choices[0].message.content?.replace(/```sql|```/g, '').trim() || args.sql;
                    lastSql = correctedSql;
                    results = await query(correctedSql);
                }

                const metaCompletion = await openai.chat.completions.create({
                    model: 'gpt-4o',
                    messages: [
                        {
                            role: 'system',
                            content: `
                                Analiza los datos y genera una respuesta profesional y analítica.
                                Retorna JSON:
                                1. visualization: "table", "bar", "line", "pie", "area".
                                2. analysis: Un párrafo humano (max 60 palabras) que explique los resultados.
                                3. suggested_questions: 3 preguntas de seguimiento completas.
                                4. insight: Un hallazgo clave breve.`
                        },
                        { role: 'user', content: `Prompt: ${prompt}\nSQL: ${lastSql}\nResultados: ${JSON.stringify(results.slice(0, 5))}` }
                    ],
                    response_format: { type: 'json_object' }
                });

                const meta = JSON.parse(metaCompletion.choices[0].message.content || '{}');

                finalResponse = {
                    data: results,
                    sql: lastSql,
                    message: meta.analysis || "Aquí tienes el análisis solicitado.",
                    insight: meta.insight,
                    visualization: meta.visualization || 'table',
                    suggested_questions: meta.suggested_questions || [],
                };
            }

            if (toolCall.function.name === 'request_clarification') {
                finalResponse = {
                    data: [],
                    sql: null,
                    message: args.message,
                    visualization: 'table',
                    suggested_questions: args.suggested_questions,
                };
            }
        } else {
            finalResponse = {
                data: [],
                message: message.content || "Entendido. ¿En qué más puedo apoyarte?",
                suggested_questions: ["Ventas de hoy", "Top 5 productos del mes"]
            };
        }

        // Log to database
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
                [prompt, JSON.stringify(finalResponse), userId, lastSql]
            );
        } catch (logError) { }

        return NextResponse.json(finalResponse);

    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({
            error: error.message || 'Internal Server Error',
            sql: lastSql
        }, { status: 500 });
    }
}
