/**
 * Razonamiento causal — cadena de hipótesis para responder "¿por qué pasó X?".
 * Versión MySQL/Nexus.
 *
 *  1. detectCausalIntent() — clasifica si la pregunta es de tipo causal
 *  2. generateHypotheses() — Claude diseña 4-6 queries SQL de hipótesis
 *  3. executeHypotheses() — ejecuta todas en paralelo con sandbox
 *  4. evaluateEvidence() — veredicto heurístico sin LLM
 *  5. generateDeepDive() — sub-hipótesis para la dimensión concentrada
 */

import { anthropic } from '@/lib/anthropic';
import { query } from '@/lib/db';
import { assertReadOnly } from '@/lib/sql-sandbox';

export interface CausalHypothesis {
    label: string;
    description: string;
    sql: string;
}

export interface CausalHypothesisResult extends CausalHypothesis {
    rows: any[];
    success: boolean;
    error?: string;
    evidence?: HypothesisEvidence;
}

export interface HypothesisEvidence {
    verdict: 'strong' | 'partial' | 'weak';
    summary: string;
    topDimension?: { column: string; value: string; share: number };
}

export function detectCausalIntent(prompt: string): boolean {
    const lower = prompt.toLowerCase();
    const causalMarkers = [
        '¿por qué', 'por qué',
        'que causó', 'qué causó', 'que causa', 'qué causa',
        'razón de', 'razon de',
        'a qué se debe', 'a que se debe',
        'qué explica', 'que explica',
        'por que motivo', 'por qué motivo',
        'investiga la caída', 'investiga el aumento',
        'analiza la caída', 'analiza el aumento',
        'diagnostica', 'diagnostico de',
        'causa raíz', 'causa raiz', 'root cause'
    ];
    return causalMarkers.some(m => lower.includes(m));
}

export async function generateHypotheses(opts: {
    userPrompt: string;
    schemaContext: string;
    pageContext?: string;
    firstSql?: string | null;
    firstResults?: any[];
    playbookHints?: string[];
}): Promise<CausalHypothesis[]> {
    const { userPrompt, schemaContext, pageContext, firstSql, firstResults, playbookHints } = opts;

    const playbookBlock = playbookHints && playbookHints.length > 0 ? `

ÁNGULOS SUGERIDOS POR PLAYBOOK DEL USUARIO:
El usuario tiene un playbook guardado que ya investigó preguntas similares con estos pasos:
${playbookHints.map((h, i) => `  ${i + 1}. ${h}`).join('\n')}

USA estos pasos como inspiración: si alguno encaja como hipótesis para la pregunta actual,
inclúyelo (traducido a SQL). No estás obligado a incluirlos todos — solo los relevantes.
` : '';

    const evidenceBlock = firstResults && firstResults.length > 0 ? `

EVIDENCIA YA OBSERVADA (consulta principal del usuario):
SQL ejecutado: ${firstSql || '(no disponible)'}
Resultados (primeros 10 filas): ${JSON.stringify(firstResults.slice(0, 10))}

USA esta evidencia para DIRIGIR tus hipótesis:
- Si los datos ya muestran concentración en una dimensión, profundiza en esa dimensión, no la repliques.
- Si una dimensión luce uniforme, NO la pruebes — sería ruido.
- Si los datos sugieren patrón temporal, busca QUÉ pasó en ese día.
- Prioriza "¿POR QUÉ se ve este patrón?" antes que "¿EXISTE el patrón?".
` : '';

    const designerPrompt = `Eres un analista senior diseñando una investigación de causa raíz sobre la operación del negocio Nexus (MySQL).

PREGUNTA DEL USUARIO:
${userPrompt}

${pageContext ? `CONTEXTO DE LA PÁGINA: ${pageContext}\n` : ''}
ESQUEMA DISPONIBLE (read-only, MySQL):
${schemaContext.slice(0, 4000)}${playbookBlock}${evidenceBlock}

TU TAREA:
Diseña ENTRE 4 Y 6 hipótesis SQL (MySQL) para investigar la causa raíz.
Cada hipótesis explora una dimensión DIFERENTE. Cubre estas dimensiones cuando aplique:

  - TEMPORAL: ¿la caída/aumento es uniforme o se concentra en un período (día/hora)?
  - ESPACIAL: ¿afecta a todas las sucursales por igual o se concentra en una?
  - CATEGÓRICA: ¿es transversal a todos los departamentos/categorías o se concentra?
  - OPERACIONAL: ¿cambió la mezcla de cajeros/usuarios, métodos de pago, tipos de venta?
  - COMPARATIVA: vs mismo día/semana del periodo anterior, vs promedio histórico
  - CLIENTE/PROVEEDOR: ¿cambió la base (tblSocios) o el ticket promedio?

REGLAS PARA LAS QUERIES (MySQL):
- SOLO SELECT (read-only)
- Usa funciones MySQL: CURDATE(), NOW(), DATE_SUB, DATE_FORMAT, YEAR/MONTH/DAY, HOUR
- Identificadores con espacios entre backticks
- Cada query corta y específica, 5-15 filas
- Independientes entre sí (corren en paralelo)
- Si la pregunta no especifica fechas, usa los últimos 7 días vs los 7 días anteriores

RESPONDE EN JSON ESTRICTO (sin markdown):
{
  "hypotheses": [
    {
      "label": "Distribución horaria",
      "description": "¿La caída se concentra en alguna franja horaria?",
      "sql": "SELECT HOUR(FechaVenta) ..."
    }
  ]
}

Genera entre 4 y 6 hipótesis. Devuelve SOLO el JSON.`;

    try {
        const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 3000,
            messages: [{ role: 'user', content: designerPrompt }]
        });

        const text = (response.content[0] as any)?.text || '';
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start < 0 || end <= start) return [];

        const parsed = JSON.parse(text.substring(start, end + 1));
        if (!Array.isArray(parsed.hypotheses)) return [];

        return parsed.hypotheses
            .filter((h: any) => h?.label && h?.sql)
            .slice(0, 6)
            .map((h: any) => ({
                label: String(h.label).slice(0, 100),
                description: String(h.description || '').slice(0, 200),
                sql: String(h.sql).replace(/```sql|```/g, '').trim()
            }));
    } catch (e) {
        console.error('generateHypotheses failed:', e);
        return [];
    }
}

export async function executeHypotheses(
    hypotheses: CausalHypothesis[]
): Promise<CausalHypothesisResult[]> {
    return Promise.all(
        hypotheses.map(async (h): Promise<CausalHypothesisResult> => {
            try {
                const safeSql = assertReadOnly(h.sql);
                const rawRows = await query(safeSql);
                const rows = (rawRows as any[]).slice(0, 10);
                const evidence = evaluateEvidence(rows);
                return {
                    ...h,
                    rows,
                    success: true,
                    evidence
                };
            } catch (e: any) {
                return {
                    ...h,
                    rows: [],
                    success: false,
                    error: e?.message || 'Error ejecutando hipótesis'
                };
            }
        })
    );
}

export function evaluateEvidence(rows: any[]): HypothesisEvidence {
    if (!rows || rows.length === 0) {
        return { verdict: 'weak', summary: 'Sin filas devueltas — hipótesis no aplica.' };
    }
    if (rows.length === 1) {
        return { verdict: 'weak', summary: 'Solo 1 fila — no hay distribución que comparar.' };
    }

    const cols = Object.keys(rows[0]);
    if (cols.length === 0) {
        return { verdict: 'weak', summary: 'Sin columnas legibles.' };
    }

    const dimCol = cols.find(c => {
        const v = rows[0][c];
        return typeof v === 'string' || v instanceof Date;
    }) || cols[0];

    const numericCols = cols.filter(c => {
        const v = rows[0][c];
        return typeof v === 'number' && c !== dimCol;
    });

    if (numericCols.length === 0) {
        return { verdict: 'weak', summary: `${rows.length} filas sin columna numérica para evaluar.` };
    }

    const metricCol = numericCols.reduce((best, c) => {
        const avgC = rows.reduce((s, r) => s + Math.abs(Number(r[c]) || 0), 0) / rows.length;
        const avgBest = rows.reduce((s, r) => s + Math.abs(Number(r[best]) || 0), 0) / rows.length;
        return avgC > avgBest ? c : best;
    }, numericCols[0]);

    const values = rows.map(r => Math.abs(Number(r[metricCol]) || 0));
    const total = values.reduce((a, b) => a + b, 0);

    if (total === 0) {
        return { verdict: 'weak', summary: `Métrica "${metricCol}" suma 0 — sin señal.` };
    }

    const sorted = rows
        .map((r, i) => ({ label: String(r[dimCol]), value: values[i] }))
        .sort((a, b) => b.value - a.value);
    const top = sorted[0];
    const share = top.value / total;

    const mean = total / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

    const sharePct = Math.round(share * 100);
    const topDimension = { column: dimCol, value: top.label, share };

    if (share >= 0.5) {
        return {
            verdict: 'strong',
            summary: `"${top.label}" concentra ${sharePct}% de ${metricCol} (${rows.length} grupos). Señal fuerte de causa localizada.`,
            topDimension
        };
    }
    if (share >= 0.3 || cv >= 0.8) {
        return {
            verdict: 'partial',
            summary: `"${top.label}" representa ${sharePct}% de ${metricCol}; varianza moderada (CV=${cv.toFixed(2)}).`,
            topDimension
        };
    }
    return {
        verdict: 'weak',
        summary: `Distribución uniforme entre ${rows.length} grupos (top "${top.label}" solo ${sharePct}%, CV=${cv.toFixed(2)}). No hay concentración explicativa.`,
        topDimension
    };
}

export async function generateDeepDive(opts: {
    userPrompt: string;
    parent: CausalHypothesisResult;
    schemaContext: string;
}): Promise<CausalHypothesis[]> {
    const { userPrompt, parent, schemaContext } = opts;
    if (!parent.evidence || parent.evidence.verdict !== 'strong' || !parent.evidence.topDimension) {
        return [];
    }

    const focus = parent.evidence.topDimension;
    const designerPrompt = `Eres un analista senior haciendo una investigación de causa raíz en SEGUNDA RONDA (MySQL).

PREGUNTA ORIGINAL DEL USUARIO:
${userPrompt}

HIPÓTESIS PADRE QUE CONFIRMÓ UNA CONCENTRACIÓN:
- Ángulo: ${parent.label}
- Pregunta original: ${parent.description}
- Hallazgo: ${parent.evidence.summary}
- Dimensión concentrada: ${focus.column} = "${focus.value}" (${Math.round(focus.share * 100)}% del total)
- Datos crudos: ${JSON.stringify(parent.rows.slice(0, 5))}

ESQUEMA DISPONIBLE (read-only):
${schemaContext.slice(0, 3000)}

TU TAREA:
Diseña EXACTAMENTE 1 o 2 sub-hipótesis SQL (MySQL) que profundicen en "${focus.value}".
NO repitas la dimensión que ya está concentrada — busca QUÉ pasó dentro de "${focus.value}":
  - Por sucursal → mira cajeros/usuarios, productos, horas, métodos pago DENTRO de esa sucursal
  - Por día/hora → mira qué cambió ese día (productos, usuarios, eventos)
  - Por departamento/producto → mira sucursales, proveedores, márgenes

REGLAS:
- SOLO SELECT
- Filtra explícitamente por ${focus.column} = "${focus.value}"
- Máximo 2 hipótesis, cada una con 5-15 filas

RESPONDE EN JSON ESTRICTO (sin markdown):
{
  "hypotheses": [
    {
      "label": "Detalle dentro de ${focus.value}",
      "description": "...",
      "sql": "SELECT ... WHERE ${focus.column} = '${focus.value}' ..."
    }
  ]
}

Devuelve SOLO el JSON.`;

    try {
        const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1500,
            messages: [{ role: 'user', content: designerPrompt }]
        });

        const text = (response.content[0] as any)?.text || '';
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start < 0 || end <= start) return [];

        const parsed = JSON.parse(text.substring(start, end + 1));
        if (!Array.isArray(parsed.hypotheses)) return [];

        return parsed.hypotheses
            .filter((h: any) => h?.label && h?.sql)
            .slice(0, 2)
            .map((h: any) => ({
                label: `↳ ${String(h.label).slice(0, 100)}`,
                description: String(h.description || '').slice(0, 200),
                sql: String(h.sql).replace(/```sql|```/g, '').trim()
            }));
    } catch (e) {
        console.error('generateDeepDive failed:', e);
        return [];
    }
}

export function formatHypothesesForPrompt(results: CausalHypothesisResult[]): string {
    const verdictRank: Record<string, number> = { strong: 0, partial: 1, weak: 2 };
    const sorted = [...results].sort((a, b) => {
        if (!a.success) return 1;
        if (!b.success) return -1;
        const av = verdictRank[a.evidence?.verdict || 'weak'] ?? 3;
        const bv = verdictRank[b.evidence?.verdict || 'weak'] ?? 3;
        return av - bv;
    });

    return sorted.map((r, i) => {
        if (!r.success) {
            return `[H${i + 1}] ${r.label} — ${r.description}\n  ERROR: ${r.error}`;
        }
        const verdictLabel = r.evidence?.verdict === 'strong' ? 'EVIDENCIA FUERTE'
            : r.evidence?.verdict === 'partial' ? 'EVIDENCIA PARCIAL'
                : 'SIN EVIDENCIA';
        const evidenceLine = r.evidence ? `\n  Veredicto preliminar: ${verdictLabel} — ${r.evidence.summary}` : '';
        const sample = JSON.stringify(r.rows.slice(0, 5));
        return `[H${i + 1}] ${r.label}\n  Pregunta: ${r.description}${evidenceLine}\n  Resultados: ${sample}`;
    }).join('\n\n');
}
