/**
 * Registro central de reportes disponibles en el portal Nexus.
 *
 * El agente IA usa este registro como fuente única de verdad para:
 *  - Saber qué reportes existen y qué responden
 *  - Recomendar al usuario el reporte correcto vía suggest_reports
 *  - Construir el system prompt dinámicamente
 *
 * Para "alimentar" el agente con un reporte nuevo: agrega una entrada aquí
 * con id, ruta, keywords, descripción y casos de uso. Listo, el agente lo verá.
 */

export interface ReportEntry {
    id: string;
    name: string;
    path: string;
    description: string;
    keywords: string[];
    useCases: string[];
}

export interface ReportCategory {
    category: string;
    reports: ReportEntry[];
}

export const AVAILABLE_REPORTS: Record<string, ReportCategory> = {
    sales: {
        category: 'VENTAS Y OPERACIONES',
        reports: [
            {
                id: 'dashboard-overview',
                name: 'Dashboard General',
                path: '/dashboard',
                description: 'KPIs principales: ventas del día/mes, ticket promedio, top productos y sucursales.',
                keywords: ['dashboard', 'overview', 'general', 'kpi', 'resumen', 'panel'],
                useCases: ['Pulso del negocio', 'Visión ejecutiva', 'Métricas del día']
            },
            {
                id: 'sales-trends',
                name: 'Tendencias de Venta',
                path: '/dashboard/ventas/tendencias',
                description: 'Evolución de ventas en el tiempo con filtros por sucursal y periodo.',
                keywords: ['tendencia', 'evolución', 'serie tiempo', 'histórico', 'gráfica ventas'],
                useCases: ['Identificar tendencia al alza/baja', 'Estacionalidad', 'Análisis temporal']
            },
            {
                id: 'sales-report',
                name: 'Reporte de Ventas',
                path: '/dashboard/reportes/ventas',
                description: 'Detalle de ventas con drill-down por sucursal, cliente, producto y cajero.',
                keywords: ['reporte ventas', 'detalle ventas', 'ticket', 'venta diaria', 'desglose'],
                useCases: ['Auditoría de ventas', 'Drill-down operativo', 'Análisis transaccional']
            },
            {
                id: 'teachers-report',
                name: 'Reporte de Profesores',
                path: '/dashboard/reportes/profesores',
                description: 'Comisiones, ventas atribuidas y desempeño por profesor con drill-down por sucursal.',
                keywords: ['profesor', 'maestro', 'comisión', 'instructor', 'socio'],
                useCases: ['Pago de comisiones', 'Performance por profesor', 'Atribución de ventas']
            }
        ]
    },
    profitability: {
        category: 'RENTABILIDAD Y MARGEN',
        reports: [
            {
                id: 'margen-rentabilidad',
                name: 'Margen y Rentabilidad',
                path: '/dashboard/reportes/margen',
                description: 'Cruza ventas reales con costo de inventario por sucursal. Calcula utilidad bruta y margen % con drill-down por sucursal, departamento, categoría, marca o artículo.',
                keywords: ['margen', 'utilidad', 'rentabilidad', 'ganancia', 'profit', 'costo', 'mark up', 'markup', 'gross profit'],
                useCases: [
                    'Identificar productos que no dejan margen',
                    'Comparar rentabilidad entre sucursales',
                    'Detectar fugas de margen por departamento',
                    'Tomar decisiones de pricing y surtido'
                ]
            }
        ]
    },
    system: {
        category: 'SISTEMA Y AUDITORÍA',
        reports: [
            {
                id: 'query-designer',
                name: 'Diseñador de Consultas',
                path: '/dashboard/settings/query-designer',
                description: 'Diseñador de esquemas de bases de datos, relaciones/joins y glosarios de columnas para entrenar al Agente de IA.',
                keywords: ['diseño', 'esquemas', 'tablas', 'relaciones', 'joins', 'campos', 'glosario', 'entrenar', 'configurar', 'describir'],
                useCases: ['Documentar campos para la IA', 'Enseñar relaciones de base de datos a la IA', 'Definir joins y glosarios']
            },
            {
                id: 'ai-learning',
                name: 'Aprendizaje IA',
                path: '/dashboard/settings/ai-learning',
                description: 'Configuración de reglas dinámicas (palabras clave) para mejora del agente.',
                keywords: ['ia', 'reglas', 'aprendizaje', 'palabras clave', 'configurar agente'],
                useCases: ['Afinar respuestas del agente', 'Reglas de negocio', 'Vocabulario']
            },
            {
                id: 'ai-history',
                name: 'Historial de Preguntas',
                path: '/dashboard/settings/ai-history',
                description: 'Auditoría de consultas hechas al agente, usuarios activos y SQL ejecutado.',
                keywords: ['historial', 'preguntas', 'auditoría', 'log', 'consultas'],
                useCases: ['Auditoría', 'Patrones de uso', 'Debug del agente']
            }
        ]
    }
};

/**
 * Renderiza el catálogo de reportes en formato markdown para inyectarlo
 * directo al system prompt del agente. Mantenerlo conciso.
 */
export function reportsCatalogForPrompt(): string {
    const lines: string[] = ['REPORTES DISPONIBLES EN EL PORTAL:', '================================'];
    for (const [, cat] of Object.entries(AVAILABLE_REPORTS)) {
        lines.push('');
        lines.push(`📊 ${cat.category}:`);
        for (const r of cat.reports) {
            lines.push(`- ${r.name} → ${r.path}`);
            lines.push(`    ${r.description}`);
        }
    }
    lines.push('');
    lines.push('USO: Cuando el usuario pida un análisis para el que exista un reporte,');
    lines.push('recomiéndalo por nombre vía la herramienta suggest_reports.');
    return lines.join('\n');
}

export function findRelevantReports(userQuery: string): Array<{
    report: ReportEntry;
    category: string;
    score: number;
}> {
    const q = userQuery.toLowerCase();
    const results: Array<{ report: ReportEntry; category: string; score: number }> = [];

    for (const cat of Object.values(AVAILABLE_REPORTS)) {
        for (const r of cat.reports) {
            let score = 0;
            if (r.name.toLowerCase().includes(q) || q.includes(r.name.toLowerCase())) score += 10;
            for (const k of r.keywords) {
                if (q.includes(k) || k.includes(q)) score += 3;
            }
            if (r.description.toLowerCase().includes(q)) score += 2;
            for (const u of r.useCases) {
                if (u.toLowerCase().includes(q) || q.includes(u.toLowerCase())) score += 2;
            }
            if (score > 0) results.push({ report: r, category: cat.category, score });
        }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 3);
}
