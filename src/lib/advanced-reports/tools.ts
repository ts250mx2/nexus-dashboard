/**
 * Tools y prompt del Agente Avanzado de Nexus.
 *
 * El agente conversa, valida SQL contra la BD (MySQL, solo lectura) y PROPONE
 * una definición de reporte data-driven. No guarda nada por su cuenta: el
 * usuario confirma nombre/modelo/costo y el endpoint /build lo persiste.
 *
 * El mismo ADVANCED_TOOLS + system prompt se usa en /run, garantizando que la
 * conversación y la validación vean exactamente el mismo contrato.
 */

import fs from 'fs';
import path from 'path';
import { query } from '@/lib/db';
import { assertReadOnly } from '@/lib/sql-sandbox';
import { substituteParams } from './params';
import type { ReportViz } from './types';

/** Esquema reutilizable de parámetros interactivos del reporte. */
const PARAMS_SCHEMA = {
    type: 'array',
    description: 'Parámetros que hacen el reporte INTERACTIVO en el visor (período, sucursales, producto, proveedor, etc.), SEGÚN aplique al reporte. Usa el token de cada parámetro como {{token}} dentro del SQL.',
    items: {
        type: 'object',
        properties: {
            token: { type: 'string', description: 'nombre del placeholder usado como {{token}} en el SQL (ej. "desde", "hasta", "sucursales", "producto", "proveedor").' },
            label: { type: 'string', description: 'etiqueta para el control en el visor (ej. "Desde", "Sucursales", "Producto contiene").' },
            kind: { type: 'string', enum: ['date', 'storeList', 'text', 'number'], description: 'date=fecha · storeList=multiselección de sucursales · text=filtro por texto (producto/proveedor/cliente/depto) · number=número.' },
            defaultValue: { type: 'string', description: 'valor por defecto: date="YYYY-MM-DD"; storeList="" (todas) o "1,2"; text="" (todas); number="10".' },
        },
        required: ['token', 'label', 'kind'],
    },
};

export const ADVANCED_TOOLS: any[] = [
    {
        name: 'query_database',
        description: 'Ejecuta una consulta MySQL de SOLO LECTURA (SELECT/WITH) contra la base Nexus para explorar datos, validar cifras y diseñar el reporte. Usa SIEMPRE LIMIT para acotar resultados grandes.',
        input_schema: {
            type: 'object',
            properties: {
                sql: { type: 'string', description: 'Consulta MySQL de lectura (SELECT o WITH). Un solo statement, sin ; final.' },
            },
            required: ['sql'],
        },
    },
    {
        name: 'ask_clarification',
        description: 'Pregunta al usuario cuando falta información o hay decisiones que conviene confirmar para acertarle al reporte: período, sucursal(es), producto(s), proveedor(es), profesor/cliente, categoría, dimensión de desglose o tipo de gráfica. Ofrece SIEMPRE opciones concretas y cliqueables en "suggestions" para que el usuario solo elija. Úsala ANTES de construir si hay dudas razonables. Puedes (opcionalmente) correr antes un query_database para listar valores reales (p. ej. nombres de sucursales o proveedores) y sugerir esos.',
        input_schema: {
            type: 'object',
            properties: {
                question: { type: 'string', description: 'Pregunta clara y breve, en español, en tono consultor.' },
                suggestions: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '2-6 opciones concretas y cliqueables (ej. "Este mes", "Mes pasado", "Por sucursal", "Gráfica de barras").',
                },
            },
            required: ['question'],
        },
    },
    {
        name: 'build_report',
        description: 'VALIDA y previsualiza el SQL candidato del reporte ANTES de proponerlo: ejecuta la consulta (read-only, con los valores por defecto de los parámetros) y devuelve filas, columnas y muestra. Pasa los mismos params que usarás en propose_report.',
        input_schema: {
            type: 'object',
            properties: {
                sql: { type: 'string', description: 'SQL final del reporte (SELECT/WITH, un statement, sin ; final). Puede usar tokens {{token}} de los parámetros.' },
                params: PARAMS_SCHEMA,
            },
            required: ['sql'],
        },
    },
    {
        name: 'propose_report',
        description: 'PROPONE el reporte ya diseñado y validado para que el usuario lo confirme. NO lo guardes tú: tras llamar a build_report y verificar que el SQL corre, llama propose_report con la definición completa. El usuario elegirá el modelo de generación, el nombre y verá el costo antes de crearlo. Llama esta tool cuando el reporte esté listo.',
        input_schema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Nombre de negocio del reporte (ej. "Ventas por sucursal — Mayo").' },
                description: { type: 'string', description: 'Descripción corta de qué muestra el reporte.' },
                sql: { type: 'string', description: 'El MISMO SQL validado con build_report (SELECT/WITH, un statement, sin ; final).' },
                visualization: { type: 'string', enum: ['table', 'bar', 'line', 'pie', 'area', 'treemap'], description: 'Cómo se grafica: bar=comparativas · line/area=series temporales · pie=distribución · treemap=rectángulos proporcionales (cuando el usuario pida "rectángulos", "treemap" o "mapa de árbol") · table=detalle.' },
                blocks: {
                    type: 'array',
                    description: 'OPCIONAL — SOLO para reportes AVANZADOS tipo TABLERO con varias vistas. Cada bloque tiene su PROPIA consulta y visualización; los "params" del reporte son GLOBALES (un solo control de período/sucursal mueve TODOS los bloques, usando los mismos {{token}} en cada SQL). VALIDA CADA bloque con build_report antes de proponer (puedes encadenar varios build_report en el mismo turno). Orden recomendado: kpis arriba → chart de tendencia → chart de ranking → table de detalle → narrative. Máx 6 bloques. Si una sola vista basta, NO uses blocks: usa sql + visualization.',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', description: 'identificador corto y estable del bloque (ej. "kpis", "tendencia", "top", "detalle").' },
                            type: { type: 'string', enum: ['kpis', 'chart', 'table', 'narrative'], description: 'kpis=tarjetas de indicadores · chart=gráfica · table=tabla de detalle · narrative=comentario del analista.' },
                            title: { type: 'string', description: 'Título del bloque (ej. "Tendencia diaria", "Top 10 productos").' },
                            sql: { type: 'string', description: 'SELECT/WITH del bloque (un statement, sin ; final). Usa los {{token}} de los params globales. No aplica a type narrative.' },
                            visualization: { type: 'string', enum: ['table', 'bar', 'line', 'pie', 'area', 'treemap'], description: 'Para type chart.' },
                            chartConfig: {
                                type: 'object',
                                description: 'Opciones de presentación del bloque.',
                                properties: {
                                    showValues: { type: 'boolean' },
                                    showPercent: { type: 'boolean' },
                                    lockViz: { type: 'boolean' },
                                    withTable: { type: 'boolean' },
                                },
                            },
                            kpis: {
                                type: 'array',
                                description: 'Para type kpis: tarjetas calculadas sobre las filas del bloque.',
                                items: {
                                    type: 'object',
                                    properties: {
                                        label: { type: 'string' },
                                        column: { type: 'string' },
                                        agg: { type: 'string', enum: ['sum', 'avg', 'min', 'max', 'count'] },
                                        format: { type: 'string', enum: ['currency', 'number', 'percent'] },
                                    },
                                    required: ['label', 'column', 'agg'],
                                },
                            },
                            expectedColumns: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        key: { type: 'string' },
                                        label: { type: 'string' },
                                        role: { type: 'string', enum: ['dimension', 'measure', 'temporal'] },
                                        format: { type: 'string', enum: ['currency', 'number', 'percent', 'date', 'text'] },
                                    },
                                    required: ['key', 'role'],
                                },
                            },
                            drill: {
                                type: 'object',
                                description: 'OPCIONAL — DRILL-DOWN del bloque: al hacer clic en una categoría (barra/rebanada/fila) abre el detalle. "sql" usa el token {{clicked}} (valor clickeado; el sistema lo entrecomilla) y puede usar los {{token}} de los params globales. Filtra por la MISMA columna que es la dimensión/eje del bloque (ej. si agrupa por Sucursal: ...WHERE S.Sucursal = {{clicked}}).',
                                properties: {
                                    sql: { type: 'string', description: 'SELECT/WITH de detalle (un statement, sin ; final) con {{clicked}}.' },
                                    title: { type: 'string', description: 'Título del panel; puede incluir {{clicked}} (ej. "Ventas de {{clicked}}").' },
                                    visualization: { type: 'string', enum: ['table', 'bar', 'line', 'pie', 'area', 'treemap'], description: 'Cómo mostrar el detalle (default table).' },
                                },
                                required: ['sql'],
                            },
                        },
                        required: ['id', 'type'],
                    },
                },
                expectedColumns: {
                    type: 'array',
                    description: 'Columnas del SELECT en ORDEN (la primera suele ser la dimensión/eje X; las numéricas, las series).',
                    items: {
                        type: 'object',
                        properties: {
                            key: { type: 'string' },
                            label: { type: 'string' },
                            role: { type: 'string', enum: ['dimension', 'measure', 'temporal'] },
                            format: { type: 'string', enum: ['currency', 'number', 'percent', 'date', 'text'] },
                        },
                        required: ['key', 'role'],
                    },
                },
                insights: { type: 'array', items: { type: 'string' }, description: '2-4 hallazgos clave con cifras.' },
                recommendations: { type: 'array', items: { type: 'string' }, description: '1-3 acciones recomendadas.' },
                suggestedQuestions: { type: 'array', items: { type: 'string' }, description: '2-3 preguntas de seguimiento.' },
                params: PARAMS_SCHEMA,
                chartConfig: {
                    type: 'object',
                    description: 'Opciones de PRESENTACIÓN de la gráfica (ajústalas según pida el usuario sobre cómo se ve).',
                    properties: {
                        showValues: { type: 'boolean', description: 'Mostrar las cantidades/valores sobre la gráfica. Actívalo si pide "pon las cantidades", "muestra los valores".' },
                        showPercent: { type: 'boolean', description: 'Mostrar los valores como PORCENTAJE del total. Actívalo si pide "ponlo en porcentaje", "que sea %".' },
                        lockViz: { type: 'boolean', description: 'Mostrar SOLO el tipo de gráfica elegido y ocultar el selector. Actívalo si pide "solo muéstrame la gráfica de X", "déjalo fijo en treemap".' },
                        withTable: { type: 'boolean', description: 'Mostrar la TABLA debajo de la gráfica (las dos juntas). Actívalo si pide "muéstrame también la tabla".' },
                    },
                },
                kpis: {
                    type: 'array',
                    description: 'Tarjetas KPI que se muestran ARRIBA del reporte, calculadas sobre las filas. Úsalas si el usuario pide "tarjetas", "indicadores", "totales arriba", "resumen".',
                    items: {
                        type: 'object',
                        properties: {
                            label: { type: 'string', description: 'Nombre de la tarjeta (ej. "Venta total", "Ticket promedio").' },
                            column: { type: 'string', description: 'Columna numérica del SELECT sobre la que se calcula.' },
                            agg: { type: 'string', enum: ['sum', 'avg', 'min', 'max', 'count'], description: 'sum=total, avg=promedio, max/min, count=número de filas.' },
                            format: { type: 'string', enum: ['currency', 'number', 'percent'] },
                        },
                        required: ['label', 'column', 'agg'],
                    },
                },
                drill: {
                    type: 'object',
                    description: 'OPCIONAL — DRILL-DOWN del reporte (single, sin blocks): al hacer clic en una categoría abre el detalle. "sql" usa el token {{clicked}} y puede usar los {{token}} de los params. Filtra por la MISMA columna que es la dimensión/eje.',
                    properties: {
                        sql: { type: 'string', description: 'SELECT/WITH de detalle (un statement, sin ; final) con {{clicked}}.' },
                        title: { type: 'string', description: 'Título del panel; puede incluir {{clicked}}.' },
                        visualization: { type: 'string', enum: ['table', 'bar', 'line', 'pie', 'area', 'treemap'], description: 'Cómo mostrar el detalle (default table).' },
                    },
                    required: ['sql'],
                },
                complexity: {
                    type: 'string',
                    enum: ['baja', 'media', 'alta'],
                    description: 'Complejidad del reporte para RECOMENDAR el modelo de generación. baja=1 tabla y agregación simple · media=varias columnas/períodos o joins ligeros · alta=múltiples joins, series temporales, causa raíz o comparativas complejas.',
                },
                complexityReason: { type: 'string', description: 'Una frase corta de por qué esa complejidad.' },
            },
            required: ['title', 'sql', 'visualization'],
        },
    },
];

/** Las mismas tools en formato de function-calling de OpenAI. */
export const ADVANCED_OPENAI_TOOLS: any[] = ADVANCED_TOOLS.map((t) => ({
    type: 'function',
    function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
    },
}));

const ALLOWED_VIZ: ReportViz[] = ['table', 'bar', 'line', 'pie', 'area', 'treemap'];
export function normalizeViz(v: unknown): ReportViz {
    return ALLOWED_VIZ.includes(v as ReportViz) ? (v as ReportViz) : 'table';
}

let cachedSchema: string | null = null;
/** Lee database-schema-ia.md (cacheado en memoria). Igual que /api/query. */
export function getAdvancedSchemaString(): string {
    if (cachedSchema !== null) return cachedSchema;
    try {
        cachedSchema = fs.readFileSync(path.join(process.cwd(), 'database-schema-ia.md'), 'utf-8');
    } catch {
        cachedSchema = '';
    }
    return cachedSchema;
}

/**
 * Convierte los Date de MySQL a texto local para que el modelo no los lea en UTC
 * (mysql2 devuelve objetos Date que al serializar a JSON salen en ISO/UTC).
 */
export function localizeDatesForModel(rows: any[]): any[] {
    return rows.map((row) => {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(row || {})) {
            out[k] = v instanceof Date
                ? v.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
                : v;
        }
        return out;
    });
}

export function buildAdvancedSystemPrompt(schemaString: string): string {
    return `Eres NEXUS, el AGENTE AVANZADO del portal: un analista de retail senior que conversa,
SUGIERE y CONSTRUYE reportes para un dueño de negocio SIN conocimientos técnicos. Eres proactivo y
consultivo: no esperas instrucciones perfectas, ayudas a definir el reporte. Al final se GUARDA un
reporte reutilizable (aparece en "Mis Reportes").

TONO: cálido, cercano y profesional. Tutea. Español de México. Nada de jerga técnica ni SQL al usuario.

CÓMO TRABAJAS (sé interactivo, no un ejecutor mudo):
1. ENTIENDE Y SUGIERE. Lee la petición. Si hay dudas razonables o decisiones que mejorarían el
   reporte, usa la tool ask_clarification con OPCIONES concretas y cliqueables:
     • Período (Hoy / Este mes / Mes pasado / Este año / Rango específico)
     • Alcance: ¿todas las sucursales o algunas? (puedes listar nombres reales con query_database)
     • Dimensión de desglose: por sucursal / categoría / producto / proveedor / profesor / usuario / día
     • Filtros: ¿algún producto, proveedor, profesor o categoría en particular?
     • Tipo de gráfica recomendada (y por qué), ofreciendo alternativas
   Agrupa en 1-2 preguntas útiles con buenas sugerencias; no interrogues de más.
2. PROPÓN. Cuando tenga sentido, propón tú una configuración por defecto ("te sugiero ventas por
   sucursal de este mes en barras; ¿lo ajustamos?") en vez de dejar al usuario en blanco.
3. DISEÑA Y PROPÓN. Cuando ya esté claro, valida el SQL con build_report (confirma que corre y trae
   filas; corrige si falla o sale vacío) y luego llama propose_report con la definición completa
   (título de negocio, SQL validado, visualización adecuada, expectedColumns en orden, insights,
   recommendations, suggestedQuestions). NO guardas tú el reporte: con propose_report se lo presentas
   al usuario, que elegirá el modelo de generación, le pondrá nombre y verá el costo antes de crearlo.
   Incluye SIEMPRE "complexity" (baja/media/alta) para recomendar el modelo adecuado.

CUÁNDO PREGUNTAR vs. PROCEDER:
- Si el período NO está claro y no es deducible → pregunta (con opciones de período).
- Si hay varias formas razonables de desglosar/graficar → propón una y ofrece alternativas.
- Si la petición ya es específica ("ventas de hoy por sucursal en barras") → procede sin preguntar.
- No preguntes lo que ya te dijeron en la conversación.

REGLA CRÍTICA DE ACCIÓN (no te quedes en plática):
- NUNCA respondas solo con texto de cortesía ("perfecto, lo preparo") sin actuar. Si ya tienes lo
  necesario, EN EL MISMO TURNO encadena las tools: query_database → build_report → propose_report.
- Si el usuario ACABA de responder tu ask_clarification, NO vuelvas a preguntar lo mismo: diseña y
  PROPÓN el reporte con esa respuesta.
- El turno no debe terminar "en el aire" si ya puedes proponer el reporte.

ENFOQUE: EL REPORTE SIEMPRE DEBE SER DINÁMICO. Guía al usuario en el armado y propón un reporte
interactivo por defecto:
- Incluye SIEMPRE que aplique un período ajustable: params 'desde'/'hasta' (el visor pone botones de
  período automáticamente). Úsalo en el SQL como V.FechaVenta >= {{desde}} AND V.FechaVenta <= {{hasta}}.
- Agrega los filtros relevantes al tema: sucursales (storeList) y, según el reporte, producto /
  proveedor / profesor / categoría (text).
- Considera tarjetas KPI arriba (total, promedio, etc.) y mostrar tabla + gráfica juntas cuando aporten.
- En "suggestedQuestions" SIEMPRE incluye 2-3 mejoras de dinamismo accionables y concretas (ej.
  "Agrégale filtro por producto", "Ponle botones de período", "Muéstrame también la tabla",
  "Agrega tarjetas KPI de total y promedio").

REGLAS DE SQL (MySQL — BDNexus):
- SOLO lectura: SELECT o WITH. Un solo statement, SIN ';' final. Nada de INSERT/UPDATE/DDL/CALL.
- Acota con LIMIT cuando el resultado pueda ser grande. NUNCA uses TOP (no existe en MySQL).
- Fechas: CURDATE(), NOW(), DATE(FechaVenta), YEAR()/MONTH()/HOUR(), DATE_SUB(CURDATE(), INTERVAL 30 DAY).
- NULL-safe: IFNULL(x, 0) y NULLIF(x, 0) para divisiones.
- Ventas válidas: filtra SIEMPRE tblVentas.Status = 0 (1 = cancelada).
- Montos en MXN. Para "Top más vendidos" ordena por importe (SUM) DESC, no por unidades, salvo que
  el usuario pida unidades explícitamente.
- Dale SIEMPRE alias legibles y en español a las columnas del SELECT (ej. AS Sucursal, AS \`Venta Total\`):
  esos alias son los encabezados que verá el usuario en la gráfica y la tabla.

REGLAS DE VISUALIZACIÓN: bar=comparar categorías · line/area=series temporales · pie=distribución
porcentual · treemap=rectángulos proporcionales (usa 'treemap' SIEMPRE que el usuario pida
"rectángulos", "treemap" o "mapa de árbol") · table=detalle multi-columna. La primera columna del
SELECT es el eje/dimensión.

PRESENTACIÓN (chartConfig) — ajusta cómo se VE la gráfica según pida el usuario:
- "pon las cantidades / muestra los valores / que se vean los números" → chartConfig.showValues = true
- "ponlo en porcentaje / que sea %" → chartConfig.showPercent = true
- "solo gráfica de pastel / déjalo en pie / fíjalo en X" → pon visualization al tipo pedido Y
  chartConfig.lockViz = true.
Cuando edites un reporte existente y el usuario pida un cambio de presentación, CONSERVA el resto de
chartConfig y del reporte; solo cambia lo pedido.

COMPONENTES que puedes agregar al reporte:
- TARJETAS KPI arriba: declara "kpis" (label, column numérica, agg sum/avg/max/min/count, format).
- TABLA + GRÁFICA juntas: chartConfig.withTable = true.
- MODAL DE DETALLE: automático — al hacer clic en una fila de la tabla se abre su detalle.

REPORTES MULTI-BLOQUE (TABLEROS) — cuando una sola gráfica NO alcanza:
- Úsalos para peticiones tipo "reporte completo", "tablero", "dashboard", "panorama general".
- En propose_report llena el arreglo "blocks": cada bloque es una vista con su PROPIO sql y su
  propia visualization. Los "params" siguen siendo GLOBALES: declara período/sucursal UNA vez a
  nivel reporte y usa los MISMOS {{token}} en el SQL de cada bloque → un solo control mueve todo.
- Estructura recomendada: 1) kpis (totales) → 2) chart de tendencia (line/area) → 3) chart de
  ranking (bar/treemap) → 4) table de detalle → 5) narrative (opcional).
- VALIDA CADA bloque con SQL con build_report antes de proponer; puedes encadenar varios
  build_report en el MISMO turno. Los bloques 'narrative' no se validan. Máximo 6 bloques.
- Si una sola vista responde la pregunta, NO uses blocks.

DRILL-DOWN (detalle al hacer clic): cuando un gráfico/tabla muestre categorías AGREGADAS (por
sucursal, producto, categoría, día…) y aporte poder hacer clic para ver el desglose, declara "drill"
en ESE bloque (o en el reporte single):
- "drill.sql": SELECT de detalle que filtra por la categoría clickeada usando el token {{clicked}}
  en la MISMA columna que es la dimensión/eje del gráfico. Ej. si el bloque agrupa ventas por sucursal:
  SELECT V.FolioVenta, V.FechaVenta, V.Total FROM tblVentas V
  INNER JOIN tblSucursales S ON V.IdSucursal = S.IdSucursal
  WHERE S.Sucursal = {{clicked}} AND V.Status = 0
    AND V.FechaVenta >= {{desde}} AND V.FechaVenta <= {{hasta}}
- NO pongas comillas alrededor de {{clicked}} (el sistema lo sustituye por el valor entrecomillado y seguro).
- "drill.title" puede incluir {{clicked}}. "drill.visualization": table por defecto.
- El drill NO se valida con build_report; asegúrate de que la columna del WHERE exista y empate la dimensión.

¿RECALCULAR O SOLO REDISEÑAR? (tú lo decides):
- Si el cambio toca los DATOS (nuevo filtro, otra dimensión/agrupación, otro período, otra métrica)
  → SÍ recalcular: usa query_database / build_report y ajusta el SQL.
- Si el cambio es SOLO de PRESENTACIÓN (tipo de gráfica, mostrar valores, porcentaje, fijar la
  gráfica) → NO recalcules: llama propose_report DIRECTAMENTE con la definición actualizada y el
  MISMO sql sin cambios.
- SIEMPRE termina llamando propose_report, aunque el cambio sea mínimo de presentación.

PARÁMETROS INTERACTIVOS (haz el reporte ajustable en el visor):
- Declara en "params" SOLO lo que aplique a ESE reporte y usa su token {{token}} dentro del SQL.
- Período dinámico: casi siempre conviene. Dos params kind 'date' (tokens "desde" y "hasta") y en el
  SQL: V.FechaVenta >= {{desde}} AND V.FechaVenta <= {{hasta}}. defaultValue en formato YYYY-MM-DD
  (ej. inicio y fin del mes actual). NO pongas comillas en el SQL alrededor del token. Al declarar
  estos dos params, el visor MUESTRA AUTOMÁTICAMENTE botones de período predefinidos (Hoy, Esta
  semana, Este mes, Mes pasado, Este año, Últimos 30 días).
- Sucursales: param kind 'storeList' (token "sucursales") y en el SQL: AND V.IdSucursal IN {{sucursales}}.
  defaultValue "" = todas. (NO pongas paréntesis alrededor del token; el sistema sustituye por (1,2,3).)
- Filtro por producto / proveedor / profesor / categoría: param kind 'text' y en el SQL:
  AND A.Descripcion LIKE {{producto}}. defaultValue "" = todos. (NO pongas comillas; el sistema
  sustituye por '%texto%'.)
- number: param kind 'number' (ej. {{topN}}) para topes/umbrales. Nota: MySQL NO acepta un parámetro
  sustituido dentro de LIMIT de forma segura en todos los casos; si usas {{topN}} en LIMIT, escríbelo
  como LIMIT {{topN}} (el sistema sustituye por un entero validado).
- Los defaultValue deben hacer que el reporte corra solo (período por defecto, filtros vacíos = todo).
- Valida SIEMPRE con build_report pasando los MISMOS params (se ejecuta con los defaults).

──────────────────────────────────────────────
CONTEXTO DEL NEGOCIO Y DATOS
──────────────────────────────────────────────
${schemaString}`;
}

export interface AdvancedToolOutcome {
    /** Texto que se devuelve al modelo como tool_result. */
    resultText: string;
    sql?: string;
    rowCount?: number;
}

/** Ejecuta una tool del agente avanzado y devuelve el resultado para el modelo. */
export async function executeAdvancedTool(
    name: string,
    input: any
): Promise<AdvancedToolOutcome> {
    switch (name) {
        case 'query_database': {
            const sql = assertReadOnly(String(input?.sql || ''));
            const rows = (await query(sql)) as any[];
            const columns = rows[0] ? Object.keys(rows[0]) : [];
            const sample = rows.slice(0, 20);
            return {
                sql,
                rowCount: rows.length,
                resultText: JSON.stringify({ ok: true, rowCount: rows.length, columns, sampleRows: localizeDatesForModel(sample) }).slice(0, 12000),
            };
        }
        case 'build_report': {
            // Sustituye los tokens {{param}} con sus valores por defecto para validar/ejecutar.
            const resolved = substituteParams(String(input?.sql || ''), input?.params);
            const sql = assertReadOnly(resolved);
            const rows = (await query(sql)) as any[];
            const columns = rows[0] ? Object.keys(rows[0]) : [];
            const sample = rows.slice(0, 10);
            return {
                sql,
                rowCount: rows.length,
                resultText: JSON.stringify({
                    ok: true,
                    rowCount: rows.length,
                    columns,
                    sampleRows: localizeDatesForModel(sample),
                    note: rows.length === 0
                        ? 'La consulta no devolvió filas. Revisa filtros/período antes de proponer.'
                        : 'Validado. Procede a propose_report si se ve correcto.',
                }).slice(0, 10000),
            };
        }
        default:
            return { resultText: JSON.stringify({ ok: false, error: `Tool desconocida: ${name}` }) };
    }
}
