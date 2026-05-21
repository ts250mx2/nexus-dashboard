import { NextResponse } from 'next/server';
import { anthropic, DEFAULT_MODEL, FAST_MODEL } from '@/lib/anthropic';
import { query } from '@/lib/db';
import { assertReadOnly } from '@/lib/sql-sandbox';

/**
 * POST /api/agent/explain-kpi
 *
 * Recibe el contexto completo de un KPI (nombre, valor actual, periodo,
 * comparativo opcional) y devuelve una explicación accionable.
 *
 * Si el modelo decide que necesita más datos, ejecuta UNA query adicional
 * (con sandbox read-only) para enriquecer el análisis.
 */

interface ExplainKpiRequest {
    kpiName: string;
    value: number;
    format?: 'currency' | 'number' | 'percent';
    period: { fechaInicio: string; fechaFin: string };
    filters?: { storeIds?: string[]; storeNames?: string[] };
    comparison?: { label: string; previousValue: number; deltaPct: number };
    pageContext?: string;
    relatedKpis?: Record<string, number>;
}

function formatValue(value: number, format?: string): string {
    if (format === 'currency') {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
    }
    if (format === 'percent') {
        return new Intl.NumberFormat('es-MX', { style: 'percent', maximumFractionDigits: 1 }).format(value / 100);
    }
    return new Intl.NumberFormat('es-MX').format(value);
}

export async function POST(req: Request) {
    try {
        const body: ExplainKpiRequest = await req.json();
        const { kpiName, value, format, period, filters, comparison, pageContext, relatedKpis } = body;

        if (!kpiName || value === undefined || !period?.fechaInicio || !period?.fechaFin) {
            return NextResponse.json({ error: 'kpiName, value y period son requeridos' }, { status: 400 });
        }

        const formattedValue = formatValue(value, format);
        const scope = filters?.storeNames?.length
            ? filters.storeNames.join(', ')
            : 'todas las sucursales';
        const relatedContext = relatedKpis
            ? Object.entries(relatedKpis).map(([k, v]) => `  ${k}: ${formatValue(v, format)}`).join('\n')
            : '';

        const comparisonText = comparison
            ? `Comparativa: ${comparison.label}\n  Valor anterior: ${formatValue(comparison.previousValue, format)}\n  Variación: ${comparison.deltaPct > 0 ? '+' : ''}${comparison.deltaPct.toFixed(1)}%`
            : 'Sin comparativa explícita en la tarjeta.';

        const planPrompt = `Eres un analista senior del negocio Nexus. El usuario hizo click en "Explícame"
sobre un KPI específico. Debes generar una explicación útil y accionable.

CONTEXTO:
${pageContext ? `Página: ${pageContext}` : ''}
KPI: ${kpiName}
Valor actual: ${formattedValue}
Período: ${period.fechaInicio} a ${period.fechaFin}
Alcance: ${scope}
${comparisonText}

Otros KPIs visibles en la página:
${relatedContext || '  (no proporcionados)'}

TU TAREA:
Decidir si quieres ejecutar UNA query SQL (SOLO SELECT, MySQL) para enriquecer la explicación,
o si la información provista alcanza.

ESQUEMA RELEVANTE (solo lectura, MySQL):
- tblVentas: IdVenta, FechaVenta DATETIME, Total DOUBLE, IdSucursal, IdSocio, IdUsuario, MetodoPago
- tblDetalleVentas: IdVenta, IdArticulo, Cantidad, PrecioBase, Total
- tblArticulos: IdArticulo, Producto, Depto, IdProveedor
- tblSucursales: IdSucursal, Nombre
- tblSocios: IdSocio, Socio, EsProveedor (clientes y proveedores consolidados)

Filtros aplicados típicamente:
  FechaVenta >= '${period.fechaInicio} 00:00:00' AND FechaVenta <= '${period.fechaFin} 23:59:59'
  ${filters?.storeIds?.length ? `AND IdSucursal IN (${filters.storeIds.join(',')})` : ''}

REGLAS:
- SOLO SELECT. Nada de INSERT/UPDATE/DELETE/DROP.
- La query debe responder UNA pregunta específica que ayude a explicar el KPI.
  Ejemplos:
    - Top 3 sucursales que aportan al KPI
    - Comparativa con días anteriores
    - Top 5 clientes (tblSocios) que mueven la métrica
    - Distribución por método de pago

RESPONDE EN JSON ESTRICTO (sin markdown):
Si NO necesitas query adicional:
{ "needs_query": false }

Si SÍ necesitas:
{
  "needs_query": true,
  "sql": "SELECT ...",
  "purpose": "Lo que quieres averiguar (1 oración)"
}`;

        let extraData: any[] = [];
        let extraSql: string | null = null;
        let extraPurpose: string | null = null;

        try {
            const planResp = await anthropic.messages.create({
                model: FAST_MODEL,
                max_tokens: 800,
                messages: [{ role: 'user', content: planPrompt }]
            });
            const planText = (planResp.content[0] as any)?.text || '';
            const start = planText.indexOf('{');
            const end = planText.lastIndexOf('}');
            if (start >= 0 && end > start) {
                const plan = JSON.parse(planText.substring(start, end + 1));
                if (plan.needs_query && plan.sql) {
                    try {
                        const safeSql = assertReadOnly(plan.sql);
                        const results = await query(safeSql);
                        extraData = (results as any[]).slice(0, 10);
                        extraSql = safeSql;
                        extraPurpose = plan.purpose || null;
                    } catch (qErr) {
                        console.warn('Query de enriquecimiento falló:', qErr);
                    }
                }
            }
        } catch (e) {
            console.warn('Plan step falló:', e);
        }

        const enrichmentContext = extraData.length > 0
            ? `

DATOS ADICIONALES RECOLECTADOS:
Propósito: ${extraPurpose}
SQL: ${extraSql}
Resultados (primeros 10): ${JSON.stringify(extraData)}`
            : '';

        const explainPrompt = `Eres Nexus IA, consultor senior. Genera una explicación útil sobre este KPI.

KPI: ${kpiName}
Valor: ${formattedValue}
Período: ${period.fechaInicio} a ${period.fechaFin}
Alcance: ${scope}
${comparisonText}

Otros KPIs:
${relatedContext || '  (no proporcionados)'}${enrichmentContext}

ESTRUCTURA:
- "explanation": Párrafo de 2-4 oraciones que explique qué hay detrás del número.
  Cifras inline con **negritas Markdown**. Tono conversacional, profesional.
  Si hay comparativa, contextualízala.
  Si tienes datos adicionales, úsalos para señalar quién/qué/dónde explica el valor.
- "bullets": 2-3 puntos clave concretos (con cifras si aplican), un dato por bullet.
- "followUpQuestions": 2-3 preguntas naturales para profundizar.

REGLAS:
- NO listas dentro del párrafo de explicación
- NO encabezados tipo "Análisis:" o "Conclusión:"
- NO digas "¿quieres saber más?" — followUpQuestions ya cubre eso
- Si la comparativa muestra caída significativa, menciónala con tono de alerta sutil

RESPONDE SOLO EN JSON:
{
  "explanation": "Texto del párrafo con **cifras en negritas**",
  "bullets": ["Punto 1 con cifra", "Punto 2 con cifra", "Punto 3"],
  "followUpQuestions": ["Pregunta 1", "Pregunta 2", "Pregunta 3"]
}`;

        const explainResp = await anthropic.messages.create({
            model: DEFAULT_MODEL,
            max_tokens: 1500,
            messages: [{ role: 'user', content: explainPrompt }]
        });
        const text = (explainResp.content[0] as any)?.text || '';
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');

        let result: any = {};
        if (start >= 0 && end > start) {
            try {
                result = JSON.parse(text.substring(start, end + 1));
            } catch {
                result = { explanation: text.slice(0, 800) };
            }
        } else {
            result = { explanation: text.slice(0, 800) };
        }

        return NextResponse.json({
            explanation: result.explanation || 'No se generó explicación.',
            bullets: Array.isArray(result.bullets) ? result.bullets.slice(0, 5) : [],
            followUpQuestions: Array.isArray(result.followUpQuestions) ? result.followUpQuestions.slice(0, 3) : [],
            enrichedWithQuery: extraData.length > 0,
            queryPurpose: extraPurpose
        });
    } catch (error: any) {
        console.error('explain-kpi error:', error);
        return NextResponse.json(
            { error: error.message || 'Error generando explicación' },
            { status: 500 }
        );
    }
}
