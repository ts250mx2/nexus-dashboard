/**
 * Definición data-driven de un reporte creado por el Agente Avanzado.
 *
 * Esta interfaz se serializa como JSON y se guarda en
 * tblAgentReports.DefinicionJson. Contiene TODO lo necesario para
 * re-renderizar el reporte en runtime SIN volver a deployar:
 * el visor /dashboard/reportes-ia/mis-reportes/[id] solo re-ejecuta `sql`
 * (read-only) y monta <ReportDataView> con `visualization`.
 */

/** Tipos de visualización que ReportDataView acepta como suggestedViz. */
export type ReportViz = 'table' | 'bar' | 'line' | 'pie' | 'area' | 'treemap';

/** Columna esperada del SELECT. ReportDataView mapea ejes POSICIONALMENTE
 *  (x = primera columna, series = resto numéricas), por lo que el orden importa. */
export interface ReportColumn {
    key: string;                                   // alias exacto de la columna en el SELECT
    label?: string;                                // etiqueta legible opcional
    role: 'dimension' | 'measure' | 'temporal';    // semántica para validación/formato
    format?: 'currency' | 'number' | 'percent' | 'date' | 'text';
}

/** Configuración declarativa de la gráfica (fuente de verdad para evolucionar el visor). */
export interface ReportChartConfig {
    xKey?: string;             // columna del eje X (default: primera columna)
    seriesKeys?: string[];     // columnas de series (default: resto numéricas)
    stacked?: boolean;
    showLegend?: boolean;
    colorScheme?: string[];    // hex opcionales
    // Opciones de presentación (las ajusta el agente por comando):
    showValues?: boolean;      // mostrar las cantidades/valores sobre la gráfica
    showPercent?: boolean;     // mostrar los valores como % del total
    lockViz?: boolean;         // mostrar SOLO el tipo de gráfica elegido (oculta el selector)
    withTable?: boolean;       // mostrar la tabla DEBAJO de la gráfica (las dos juntas)
}

/** Tarjeta KPI calculada sobre los datos del reporte (se muestra arriba). */
export interface ReportKpi {
    label: string;
    column: string;                                  // columna numérica del SELECT
    agg: 'sum' | 'avg' | 'min' | 'max' | 'count';    // agregación sobre las filas
    format?: 'currency' | 'number' | 'percent';
}

/** Tipo de parámetro interactivo del reporte. */
export type ReportParamKind = 'date' | 'storeList' | 'text' | 'number';

/**
 * Parámetro declarativo que hace el reporte INTERACTIVO. El SQL usa el token
 * `{{token}}` donde quiera el valor; el visor renderiza el control adecuado y
 * el servidor sustituye el token por un fragmento SQL seguro (ver params.ts).
 *
 * Convención de uso en el SQL:
 *   date      → `V.FechaVenta >= {{desde}}` (se sustituye por 'YYYY-MM-DD')
 *   storeList → `AND V.IdSucursal IN {{sucursales}}` (se sustituye por (1,2,3) o todas)
 *   text      → `AND A.Descripcion LIKE {{producto}}` (se sustituye por '%texto%' o '%')
 *   number    → `... {{topN}}` (se sustituye por el número)
 */
export interface ReportParam {
    token: string;                         // nombre del placeholder {{token}} en el SQL
    label: string;                         // etiqueta para el control del visor
    kind: ReportParamKind;
    defaultValue?: string;                 // date='YYYY-MM-DD', storeList='id,id' o '', text='', number='0'
    required?: boolean;
}

/** Composición de bloques del reporte renderizado. */
export interface ReportLayout {
    sections: Array<{
        type: 'kpis' | 'chart' | 'table' | 'insights' | 'recommendations';
        title?: string;
        order: number;
    }>;
}

/** Tipo de bloque dentro de un reporte multi-bloque (schemaVersion >= 2). */
export type ReportBlockType = 'kpis' | 'chart' | 'table' | 'narrative';

/**
 * Configuración de DRILL-DOWN: al hacer clic en una categoría (barra/rebanada/fila),
 * el visor re-ejecuta este SQL filtrado por el valor clickeado y muestra el detalle
 * en un modal. El SQL usa el token `{{clicked}}` (el sistema lo sustituye por el valor
 * como literal SQL seguro) y TAMBIÉN puede usar los `{{token}}` de los params globales.
 *
 * Convención: el WHERE debe filtrar por la MISMA columna que es la dimensión/eje del
 * bloque padre. Ej. si el bloque agrupa por Sucursal: `... WHERE S.Sucursal = {{clicked}}`.
 */
export interface ReportDrill {
    sql: string;                 // SELECT/WITH con {{clicked}} (y opcionalmente params globales)
    title?: string;              // título del panel de detalle; puede incluir {{clicked}}
    visualization?: ReportViz;   // cómo mostrar el detalle (default 'table')
}

/**
 * Un bloque de un reporte multi-bloque (un "tablero"). Cada bloque tiene su
 * PROPIA consulta (salvo 'narrative') y su propia visualización. Los `params`
 * del reporte son GLOBALES: el SQL de cada bloque usa los mismos `{{token}}`,
 * de modo que un solo control de período/sucursal mueve todos los bloques.
 *
 * El visor itera `definition.blocks` y monta el sub-render correcto por tipo:
 *   kpis      → tarjetas calculadas sobre las filas del bloque (usa `kpis`)
 *   chart     → <ReportDataView> con `visualization`
 *   table     → <ReportDataView> en modo tabla
 *   narrative → texto del analista (estático o generado por IA)
 */
export interface ReportBlock {
    id: string;                                    // identificador estable del bloque
    type: ReportBlockType;
    title?: string;
    sql?: string;                                  // SELECT/WITH con tokens {{...}}; no aplica a 'narrative'
    visualization?: ReportViz;                     // para type 'chart' (default 'bar')
    chartConfig?: ReportChartConfig;
    kpis?: ReportKpi[];                            // para type 'kpis'
    expectedColumns?: ReportColumn[];              // orden de columnas del SELECT del bloque
    rowLimit?: number;                             // tope de filas del bloque (default 500)
    narrative?: { source: 'ai' | 'static'; text?: string };  // para type 'narrative'
    drill?: ReportDrill;                           // drill-down al clic en una categoría del bloque
}

export interface AdvancedReportDefinition {
    schemaVersion: number;                 // 1 = single, 2 = multi-bloque
    title: string;
    description?: string;
    sql: string;                           // SELECT/WITH validado con assertReadOnly (sin ';' final)
    expectedColumns: ReportColumn[];       // orden de columnas del SELECT
    visualization: ReportViz;              // suggestedViz para ReportDataView
    chartConfig?: ReportChartConfig;
    // Multi-bloque (schemaVersion >= 2). Si `blocks` está presente y no vacío, el
    // visor renderiza un TABLERO (itera blocks) e IGNORA sql/visualization de raíz.
    // Si falta, se usa el camino single de v1 (sql + visualization). El
    // comportamiento se decide por la PRESENCIA de `blocks`, no por el número de versión.
    blocks?: ReportBlock[];
    drill?: ReportDrill;                   // drill-down para el reporte single (v1)
    layout?: ReportLayout;
    params?: ReportParam[];                // placeholders {{token}} del SQL
    kpis?: ReportKpi[];                    // tarjetas KPI arriba del reporte
    insights: string[];                    // hallazgos generados al crear
    recommendations: string[];
    suggestedQuestions: string[];
    rowLimit?: number;                     // tope de filas a renderizar (default 500)
    createdWith: {
        model: string;                     // ej. claude-opus-5
        createdAt: string;                 // ISO
        promptSummary?: string;            // resumen de la petición original
    };
}

export const ADVANCED_REPORT_SCHEMA_VERSION = 2;
