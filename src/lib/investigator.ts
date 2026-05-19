/**
 * Modo Investigador Autónomo.
 *
 * Después de la primera query del agente, evalúa si los resultados muestran
 * una anomalía clara que valga la pena profundizar. Si la hay, propone UNA
 * query SQL adicional (read-only) que ayude a entender la causa raíz.
 *
 * Diseño:
 *  - Costo controlado: una sola llamada extra a Claude con max_tokens bajo
 *  - Solo se activa si el primer resultado vino de query_database con datos
 *  - Devuelve null si no detecta nada notable (común — no fuerza follow-up)
 *  - El SQL propuesto pasa por el sandbox antes de ejecutarse
 */

import { anthropic } from '@/lib/anthropic';

export interface FollowUpProposal {
    question: string;
    sql: string;
    rationale: string;
}

export async function proposeFollowUp(opts: {
    userPrompt: string;
    firstSql: string;
    firstResults: any[];
    schemaContext: string;
    model: string;
}): Promise<FollowUpProposal | null> {
    const { userPrompt, firstSql, firstResults, schemaContext, model } = opts;

    if (!firstResults || firstResults.length === 0) return null;

    const firstRow = firstResults[0];
    const cols = Object.keys(firstRow || {});
    if (firstResults.length === 1 && cols.length === 1) return null;

    const sample = JSON.stringify(firstResults.slice(0, 8));

    const detectorPrompt = `Eres un analista senior. Te muestro los resultados de UNA consulta inicial
que respondió a la pregunta del usuario. Tu trabajo: decidir si los datos
muestran una ANOMALÍA CLARA que merezca una segunda consulta para entender
la causa raíz.

CRITERIOS PARA INVESTIGAR (devuelve follow-up):
• Caída/subida >20% inesperada en una métrica
• Una sucursal/producto/categoría con comportamiento muy distinto al resto
• Concentración inusual (un solo elemento explica >60% del total)
• Patrón que sugiere algo operativo (ej: caída concentrada en últimas horas)

NO INVESTIGAR (devuelve null) si:
• Los datos son agregados sin desglose (no se puede profundizar)
• La pregunta era simple y la respuesta fue clara y completa
• No hay nada estadísticamente notable
• El usuario ya pidió detalle máximo (top N, distribución completa, etc.)

Si decides investigar, debes generar UNA consulta MySQL adicional que:
• Sea SOLO SELECT (read-only)
• Profundice en la dimensión anómala
• Use exactamente los nombres de tablas/columnas del schema
• Sea concisa, no más de 100 líneas

ESQUEMA DISPONIBLE (parcial):
${schemaContext.slice(0, 4000)}

PREGUNTA ORIGINAL: ${userPrompt}
SQL EJECUTADO: ${firstSql}
RESULTADOS (muestra): ${sample}

RESPONDE EN JSON ESTRICTO:
Si NO hay que investigar:
{"investigate": false}

Si SÍ hay que investigar:
{
  "investigate": true,
  "question": "Pregunta breve en lenguaje natural sobre qué se investiga",
  "rationale": "Una oración: qué llamó la atención",
  "sql": "SELECT ..."
}

Devuelve SOLO el JSON, sin markdown ni explicaciones extra.`;

    try {
        const response = await anthropic.messages.create({
            model,
            max_tokens: 1500,
            messages: [{ role: 'user', content: detectorPrompt }]
        });

        const text = (response.content[0] as any)?.text || '';
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start < 0 || end <= start) return null;

        const parsed = JSON.parse(text.substring(start, end + 1));

        if (!parsed.investigate) return null;
        if (!parsed.sql || !parsed.question) return null;

        return {
            question: String(parsed.question).slice(0, 200),
            rationale: String(parsed.rationale || '').slice(0, 200),
            sql: String(parsed.sql).replace(/```sql|```/g, '').trim()
        };
    } catch (e) {
        console.error('proposeFollowUp failed:', e);
        return null;
    }
}
