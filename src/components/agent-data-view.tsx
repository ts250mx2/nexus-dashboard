'use client';

/**
 * AgentDataView — visualización estilo Claude.ai para resultados del agente.
 *
 * Decide automáticamente el mejor formato según el shape de los datos:
 *  - 1 fila × 1 valor numérico       → KPI gigante centrado
 *  - 1 fila × N valores              → fila de KPIs
 *  - Serie temporal                  → line/area
 *  - Distribución porcentual         → pie/donut
 *  - Comparativa entre categorías    → bar
 *  - Demás casos                     → tabla limpia
 *
 * El usuario puede cambiar la vista con un selector pequeño en la esquina.
 * Export a Excel en un click.
 */

import { useMemo, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, CartesianGrid
} from 'recharts';
import {
    Table as TableIcon, BarChart3, LineChart as LineIcon, PieChart as PieIcon,
    ChevronRight, TrendingUp, TrendingDown, Minus, Download
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { utils, writeFile } from 'xlsx';

type Viz = 'auto' | 'kpi' | 'table' | 'bar' | 'line' | 'area' | 'pie';

interface AgentDataViewProps {
    data: Record<string, any>[];
    suggestedViz?: 'table' | 'bar' | 'line' | 'pie' | 'area' | 'kpi';
    question?: string;
}

const PALETTE = {
    primary: '#2563EB',
    primaryLight: '#60A5FA',
    soft: ['#2563EB', '#06B6D4', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#14B8A6'],
    muted: '#64748B',
    grid: '#E2E8F0'
};

function isNumericKey(_key: string, sample: any): boolean {
    if (typeof sample === 'number') return true;
    if (typeof sample === 'string' && /^-?\d+(\.\d+)?$/.test(sample.trim())) return true;
    return false;
}

function isCurrencyKey(key: string): boolean {
    return /total|costo|monto|venta|precio|promedio|descuento|importe|ingreso|margen|utilidad|ganancia/i.test(key)
        && !/cantidad|unidades|tickets|clientes|articulos|recuento|conteo|id|folio|caja|z\b|anio|año|mes|dia/i.test(key);
}

function isPercentKey(key: string): boolean {
    return /pct|porcentaje|percent|variacion|%/i.test(key);
}

function isTemporalKey(key: string, sample: any): boolean {
    if (/fecha|date|dia|hora|periodo|mes|trimestre|anio|año|semana|month|day|year/i.test(key)) return true;
    if (typeof sample === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sample)) return true;
    if (sample instanceof Date) return true;
    return false;
}

function formatNumber(value: number, opts: { currency?: boolean; percent?: boolean; compact?: boolean } = {}): string {
    if (value === null || value === undefined || isNaN(value)) return '—';

    if (opts.currency) {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            notation: opts.compact && Math.abs(value) >= 10000 ? 'compact' : 'standard',
            maximumFractionDigits: opts.compact && Math.abs(value) >= 10000 ? 1 : 2
        }).format(value);
    }

    if (opts.percent) {
        return new Intl.NumberFormat('es-MX', {
            style: 'percent',
            maximumFractionDigits: 1
        }).format(Math.abs(value) > 1 ? value / 100 : value);
    }

    return new Intl.NumberFormat('es-MX', {
        notation: opts.compact && Math.abs(value) >= 10000 ? 'compact' : 'standard',
        maximumFractionDigits: opts.compact && Math.abs(value) >= 10000 ? 1 : 2
    }).format(value);
}

function formatCell(key: string, value: any): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') {
        return formatNumber(value, {
            currency: isCurrencyKey(key),
            percent: isPercentKey(key)
        });
    }
    if (value instanceof Date) {
        return value.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return String(value);
}

function detectAutoViz(data: Record<string, any>[], suggested?: string): Exclude<Viz, 'auto'> {
    if (!data || data.length === 0) return 'table';
    const keys = Object.keys(data[0]);
    const numKeys = keys.filter(k => isNumericKey(k, data[0][k]));
    const hasTemporal = keys.some(k => isTemporalKey(k, data[0][k]));

    if (data.length === 1 && numKeys.length > 0) return 'kpi';

    if (hasTemporal && numKeys.length > 0 && data.length >= 3 && data.length <= 50) {
        return suggested === 'area' ? 'area' : 'line';
    }

    if (data.length >= 2 && data.length <= 7 && numKeys.length === 1 && suggested === 'pie') {
        return 'pie';
    }

    if (data.length >= 2 && data.length <= 20 && numKeys.length >= 1 && !hasTemporal) {
        return suggested === 'bar' ? 'bar' : (data.length <= 8 ? 'bar' : 'table');
    }

    if (suggested && suggested !== 'table' && suggested !== 'kpi' && data.length <= 50) {
        return suggested as Exclude<Viz, 'auto' | 'kpi'>;
    }

    return 'table';
}

function KpiCards({ data }: { data: Record<string, any>[] }) {
    const row = data[0];
    const keys = Object.keys(row);
    const numericEntries = keys.filter(k => isNumericKey(k, row[k]));

    let trendInfo: { delta: number; pct: number; up: boolean } | null = null;
    const actualKey = numericEntries.find(k => /hoy|actual|nuevo|current/i.test(k));
    const refKey = numericEntries.find(k => /ayer|anterior|previo|previous|prev/i.test(k));
    if (actualKey && refKey) {
        const a = Number(row[actualKey]);
        const r = Number(row[refKey]);
        if (!isNaN(a) && !isNaN(r) && r !== 0) {
            const delta = a - r;
            trendInfo = { delta, pct: (delta / Math.abs(r)) * 100, up: delta > 0 };
        }
    }

    if (numericEntries.length === 1) {
        const k = numericEntries[0];
        const v = Number(row[k]);
        return (
            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-3">{k}</div>
                <div className="text-5xl font-black text-slate-900 tabular-nums tracking-tight">
                    {formatNumber(v, { currency: isCurrencyKey(k), percent: isPercentKey(k), compact: true })}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <div className={cn(
                "grid gap-4",
                numericEntries.length === 2 && "grid-cols-2",
                numericEntries.length === 3 && "grid-cols-3",
                numericEntries.length >= 4 && "grid-cols-2 md:grid-cols-4"
            )}>
                {numericEntries.map((k) => {
                    const v = Number(row[k]);
                    return (
                        <div key={k} className="px-2 py-3 border-r last:border-r-0 border-slate-100">
                            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1.5 truncate">
                                {k}
                            </div>
                            <div className="text-2xl font-black text-slate-900 tabular-nums tracking-tight">
                                {formatNumber(v, {
                                    currency: isCurrencyKey(k),
                                    percent: isPercentKey(k),
                                    compact: true
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
            {trendInfo && (
                <div className={cn(
                    "mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-sm font-bold",
                    trendInfo.up ? 'text-emerald-600' : trendInfo.delta < 0 ? 'text-rose-600' : 'text-slate-500'
                )}>
                    {trendInfo.up ? <TrendingUp className="w-4 h-4" /> :
                        trendInfo.delta < 0 ? <TrendingDown className="w-4 h-4" /> :
                            <Minus className="w-4 h-4" />}
                    <span className="tabular-nums">
                        {trendInfo.delta > 0 ? '+' : ''}{formatNumber(trendInfo.pct, { compact: true })}%
                    </span>
                    <span className="text-slate-400 font-medium">vs referencia</span>
                </div>
            )}
        </div>
    );
}

function ElegantTable({ data, compact = false }: { data: Record<string, any>[]; compact?: boolean }) {
    const keys = Object.keys(data[0]);
    const maxVisible = compact ? 5 : 50;
    const [showAll, setShowAll] = useState(false);
    const visibleData = showAll ? data : data.slice(0, maxVisible);

    return (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-100">
                            {keys.map((k) => {
                                const isNum = isNumericKey(k, data[0][k]);
                                return (
                                    <th key={k} className={cn(
                                        "px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500",
                                        isNum ? 'text-right' : 'text-left'
                                    )}>
                                        {k}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {visibleData.map((row, i) => (
                            <tr key={i} className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50 transition-colors">
                                {keys.map((k) => {
                                    const isNum = isNumericKey(k, row[k]);
                                    return (
                                        <td key={k} className={cn(
                                            "px-4 py-3 text-slate-700",
                                            isNum ? 'text-right tabular-nums font-medium text-slate-900' : 'font-medium'
                                        )}>
                                            {formatCell(k, row[k])}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {data.length > maxVisible && (
                <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500 font-medium">
                        {showAll ? `Mostrando ${data.length} filas` : `Mostrando ${maxVisible} de ${data.length}`}
                    </span>
                    {!showAll && (
                        <button
                            onClick={() => setShowAll(true)}
                            className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                            Ver todas <ChevronRight className="w-3 h-3" />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function MinimalChart({ data, type }: { data: Record<string, any>[]; type: 'bar' | 'line' | 'area' | 'pie' }) {
    const keys = Object.keys(data[0]);
    const xKey = keys[0];
    const numKeys = keys.slice(1).filter(k => isNumericKey(k, data[0][k]));
    const isCurrency = numKeys.length > 0 && isCurrencyKey(numKeys[0]);

    const tooltipFormatter = (value: any, name?: string) => {
        const safeName = name || '';
        if (typeof value === 'number') {
            return [formatNumber(value, { currency: isCurrencyKey(safeName), percent: isPercentKey(safeName) }), safeName];
        }
        return [value, safeName];
    };

    const yAxisFormatter = (value: any) =>
        typeof value === 'number'
            ? formatNumber(value, { currency: isCurrency, compact: true })
            : String(value);

    const commonChartProps = {
        data,
        margin: { top: 12, right: 16, left: 0, bottom: 24 }
    };

    const axisProps = {
        stroke: PALETTE.muted,
        fontSize: 11,
        tickLine: false,
        axisLine: false,
        style: { fontFamily: 'inherit' }
    };

    const gridProps = { stroke: PALETTE.grid, strokeDasharray: '0', vertical: false } as const;

    const tooltipStyle: React.CSSProperties = {
        backgroundColor: 'white',
        border: '1px solid #E2E8F0',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
        fontSize: '12px',
        padding: '8px 12px'
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
                {type === 'line' ? (
                    <LineChart {...commonChartProps}>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey={xKey} {...axisProps} />
                        <YAxis {...axisProps} tickFormatter={yAxisFormatter} />
                        <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} cursor={{ stroke: PALETTE.grid, strokeWidth: 1 }} />
                        {numKeys.map((k, i) => (
                            <Line
                                key={k}
                                type="monotone"
                                dataKey={k}
                                stroke={PALETTE.soft[i % PALETTE.soft.length]}
                                strokeWidth={2}
                                dot={{ r: 3, strokeWidth: 0, fill: PALETTE.soft[i % PALETTE.soft.length] }}
                                activeDot={{ r: 5, strokeWidth: 2, stroke: 'white' }}
                            />
                        ))}
                    </LineChart>
                ) : type === 'area' ? (
                    <AreaChart {...commonChartProps}>
                        <defs>
                            {numKeys.map((_, i) => (
                                <linearGradient key={i} id={`area-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={PALETTE.soft[i % PALETTE.soft.length]} stopOpacity={0.25} />
                                    <stop offset="100%" stopColor={PALETTE.soft[i % PALETTE.soft.length]} stopOpacity={0} />
                                </linearGradient>
                            ))}
                        </defs>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey={xKey} {...axisProps} />
                        <YAxis {...axisProps} tickFormatter={yAxisFormatter} />
                        <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                        {numKeys.map((k, i) => (
                            <Area
                                key={k}
                                type="monotone"
                                dataKey={k}
                                stroke={PALETTE.soft[i % PALETTE.soft.length]}
                                fill={`url(#area-grad-${i})`}
                                strokeWidth={2}
                            />
                        ))}
                    </AreaChart>
                ) : type === 'pie' ? (
                    <PieChart>
                        <Pie
                            data={data}
                            dataKey={numKeys[0]}
                            nameKey={xKey}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={110}
                            paddingAngle={2}
                            label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                            labelLine={false}
                        >
                            {data.map((_, i) => (
                                <Cell key={i} fill={PALETTE.soft[i % PALETTE.soft.length]} stroke="white" strokeWidth={2} />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                    </PieChart>
                ) : (
                    <BarChart {...commonChartProps}>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey={xKey} {...axisProps} />
                        <YAxis {...axisProps} tickFormatter={yAxisFormatter} />
                        <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} cursor={{ fill: '#F8FAFC' }} />
                        {numKeys.map((k, i) => (
                            <Bar
                                key={k}
                                dataKey={k}
                                fill={PALETTE.soft[i % PALETTE.soft.length]}
                                radius={[6, 6, 0, 0]}
                                maxBarSize={48}
                            />
                        ))}
                    </BarChart>
                )}
            </ResponsiveContainer>
        </div>
    );
}

export function AgentDataView({ data, suggestedViz, question }: AgentDataViewProps) {
    const [overrideViz, setOverrideViz] = useState<Viz>('auto');

    const autoViz = useMemo(() => detectAutoViz(data, suggestedViz), [data, suggestedViz]);
    const activeViz = overrideViz === 'auto' ? autoViz : overrideViz;

    if (!data || data.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-slate-100 p-6 text-center">
                <p className="text-sm text-slate-500">No hay datos para mostrar.</p>
            </div>
        );
    }

    const availableVizs: { id: Viz; label: string; icon: any }[] = [];
    const keys = Object.keys(data[0]);
    const numKeys = keys.filter(k => isNumericKey(k, data[0][k]));

    if (data.length === 1 && numKeys.length > 0) availableVizs.push({ id: 'kpi', label: 'KPI', icon: TrendingUp });
    availableVizs.push({ id: 'table', label: 'Tabla', icon: TableIcon });
    if (data.length >= 2 && data.length <= 50 && numKeys.length > 0) {
        availableVizs.push({ id: 'bar', label: 'Barras', icon: BarChart3 });
        availableVizs.push({ id: 'line', label: 'Línea', icon: LineIcon });
        if (data.length <= 7) availableVizs.push({ id: 'pie', label: 'Pie', icon: PieIcon });
    }

    const handleExport = () => {
        const ws = utils.json_to_sheet(data);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, 'Análisis');
        const filename = question ? question.slice(0, 30).replace(/[^a-z0-9]+/gi, '_') : 'analisis_nexus';
        writeFile(wb, `${filename}.xlsx`);
    };

    return (
        <div className="space-y-2">
            {availableVizs.length > 1 && (
                <div className="flex items-center justify-between">
                    <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
                        {availableVizs.map(({ id, label, icon: Icon }) => {
                            const active = activeViz === id;
                            return (
                                <button
                                    key={id}
                                    onClick={() => setOverrideViz(id)}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all",
                                        active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                    )}
                                >
                                    <Icon className="w-3 h-3" />
                                    <span>{label}</span>
                                </button>
                            );
                        })}
                    </div>
                    <button
                        onClick={handleExport}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-700 transition-colors"
                        title="Descargar Excel"
                    >
                        <Download className="w-3 h-3" />
                        <span>Excel</span>
                    </button>
                </div>
            )}

            {activeViz === 'kpi' && <KpiCards data={data} />}
            {activeViz === 'table' && <ElegantTable data={data} />}
            {(activeViz === 'bar' || activeViz === 'line' || activeViz === 'area' || activeViz === 'pie') && (
                <MinimalChart data={data} type={activeViz} />
            )}

            <div className="text-[10px] text-slate-400 px-1 font-medium">
                {data.length} {data.length === 1 ? 'registro' : 'registros'}
                {suggestedViz && overrideViz === 'auto' && (
                    <span className="ml-2 text-slate-300">· Vista sugerida automáticamente</span>
                )}
            </div>
        </div>
    );
}
