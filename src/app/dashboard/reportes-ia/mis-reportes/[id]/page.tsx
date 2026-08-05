"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lightbulb, Target, Sparkles, Loader2, SlidersHorizontal, Wand2, ChevronDown, FileDown } from "lucide-react";
import { ReportDataView } from "@/components/report-data-view";
import { downloadPdf } from "@/lib/export-pdf";
import type { AdvancedReportDefinition, ReportParam, ReportKpi, ReportBlock, ReportViz } from "@/lib/advanced-reports/types";

interface ModelOption { id: string; label: string; provider: string; }
interface StoreOption { id: number; name: string; }

interface AiAnalysis {
    modelLabel: string;
    narrative: string;
    insights: string[];
    recommendations: string[];
    cost: { tokensInput: number; tokensOutput: number; costUsd: number; costMxn: number };
}

/** Un bloque ya cargado con sus filas (lo que devuelve el data route en multi-bloque). */
type LoadedBlock = ReportBlock & { rows: any[]; rowCount: number; error?: string };

interface ReportData {
    definition: AdvancedReportDefinition;
    rows?: any[];                 // camino single (v1)
    rowCount?: number;            // camino single (v1)
    blocks?: LoadedBlock[];       // camino multi-bloque (tablero)
    title: string;
    descripcion: string | null;
    modelo?: string | null;
    cost: { realCostoMxn: number | null };
    fechaCreacion: string;
}

const CONSOLE_PATH = "/dashboard/reportes-ia/agente-avanzado";
const REPORTS_PATH = "/dashboard/reportes-ia/mis-reportes";

function renderBold(text: string): React.ReactNode {
    return text.split(/\*\*/).map((seg, i) =>
        i % 2 === 1 ? <strong key={i}>{seg}</strong> : <React.Fragment key={i}>{seg}</React.Fragment>
    );
}

/** Presets de período (fechas locales, no UTC). */
function periodPresets(): { label: string; start: string; end: string }[] {
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const today = new Date();
    const t = iso(today);
    const yest = new Date(today); yest.setDate(today.getDate() - 1);
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    const yearStart = new Date(today.getFullYear(), 0, 1);
    const d30 = new Date(today); d30.setDate(today.getDate() - 29);
    return [
        { label: "Hoy", start: t, end: t },
        { label: "Ayer", start: iso(yest), end: iso(yest) },
        { label: "Esta semana", start: iso(weekStart), end: t },
        { label: "Este mes", start: iso(monthStart), end: t },
        { label: "Mes pasado", start: iso(lastMonthStart), end: iso(lastMonthEnd) },
        { label: "Este año", start: iso(yearStart), end: t },
        { label: "Últimos 30 días", start: iso(d30), end: t },
    ];
}

function computeKpi(rows: any[], kpi: ReportKpi): number {
    if (kpi.agg === "count") return rows.length;
    const vals = rows.map((r) => Number(r[kpi.column])).filter((v) => Number.isFinite(v));
    if (!vals.length) return 0;
    if (kpi.agg === "sum") return vals.reduce((a, b) => a + b, 0);
    if (kpi.agg === "avg") return vals.reduce((a, b) => a + b, 0) / vals.length;
    if (kpi.agg === "min") return Math.min(...vals);
    if (kpi.agg === "max") return Math.max(...vals);
    return 0;
}
function fmtKpiVal(v: number, format?: string): string {
    if (format === "currency") return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: Math.abs(v) >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(v);
    if (format === "percent") return new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 }).format(Math.abs(v) > 1 ? v / 100 : v);
    return new Intl.NumberFormat("es-MX", { notation: Math.abs(v) >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(v);
}
const isDeptParam = (p: ReportParam) => /depto|departamento|categor/i.test(p.token) || /depto|departamento|categor/i.test(p.label);

/** Renderiza UN bloque del tablero según su tipo (kpis/chart/table/narrative). */
function ReportBlockView({ block, onDrill }: { block: LoadedBlock; onDrill?: (clicked: string) => void }) {
    const heading = block.title ? (
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-500 mb-3">{block.title}</h3>
    ) : null;

    // Comentario del analista (estático o generado al crear)
    if (block.type === "narrative") {
        const txt = block.narrative?.text?.trim();
        if (!txt) return null;
        return (
            <div className="bg-white rounded-3xl border border-slate-100 p-5">
                {heading}
                <p className="text-[15px] leading-relaxed text-slate-700 font-medium">{renderBold(txt)}</p>
            </div>
        );
    }

    // Un bloque que falló no tumba el tablero: se muestra su error y los demás siguen.
    if (block.error) {
        return (
            <div className="bg-white rounded-3xl border border-slate-100 p-5">
                {heading}
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm font-medium">
                    No se pudo cargar este bloque: {block.error}
                </div>
            </div>
        );
    }

    // Tarjetas KPI calculadas sobre las filas del bloque
    if (block.type === "kpis") {
        const kpis = block.kpis || [];
        if (kpis.length === 0 || block.rows.length === 0) return null;
        return (
            <div>
                {heading}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {kpis.map((k, i) => (
                        <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">{k.label}</div>
                            <div className="text-2xl font-black text-slate-900 tabular-nums mt-1">{fmtKpiVal(computeKpi(block.rows, k), k.format)}</div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // chart / table → ReportDataView
    return (
        <div className="bg-white rounded-3xl border border-slate-100 p-4 md:p-6">
            {heading}
            {block.rows.length > 0 ? (
                <ReportDataView
                    data={block.rows}
                    suggestedViz={block.type === "table" ? "table" : (block.visualization || "bar")}
                    question={block.title}
                    lockViz={block.chartConfig?.lockViz}
                    showValues={block.chartConfig?.showValues}
                    showPercent={block.chartConfig?.showPercent}
                    alsoTable={block.chartConfig?.withTable}
                    onDrill={block.drill ? onDrill : undefined}
                />
            ) : (
                <p className="text-slate-400 font-medium py-8 text-center">Sin datos para este bloque con los filtros actuales.</p>
            )}
        </div>
    );
}

function toggleCsv(csv: string, id: number): string {
    const set = new Set((csv || "").split(",").map((s) => s.trim()).filter(Boolean));
    const k = String(id);
    if (set.has(k)) set.delete(k); else set.add(k);
    return Array.from(set).join(",");
}

/** Dropdown multi-check de sucursales (vacío = todas). */
function StoreMultiSelect({ stores, value, onChange }: { stores: StoreOption[]; value: string; onChange: (v: string) => void }) {
    const [open, setOpen] = useState(false);
    const selected = new Set((value || "").split(",").map((s) => s.trim()).filter(Boolean));
    const count = selected.size;
    const label = count === 0 ? "Todas las sucursales" : `${count} sucursal(es)`;
    return (
        <div className="relative">
            <button onClick={() => setOpen((o) => !o)}
                className="min-w-[200px] flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm hover:border-indigo-400">
                <span>{label}</span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div className="absolute z-20 mt-1 w-64 max-h-72 overflow-auto bg-white border border-slate-200 rounded-xl shadow-xl p-2">
                        <div className="flex items-center justify-between px-1 pb-1.5 mb-1 border-b border-slate-100">
                            <button onClick={() => onChange("")} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700">Todas</button>
                            {count > 0 && <button onClick={() => onChange("")} className="text-[11px] text-slate-400 hover:text-slate-600">Limpiar</button>}
                        </div>
                        {stores.length === 0 && <div className="text-xs text-slate-400 px-2 py-3">cargando sucursales…</div>}
                        {stores.map((s) => (
                            <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                                <input type="checkbox" checked={selected.has(String(s.id))} onChange={() => onChange(toggleCsv(value, s.id))} className="accent-indigo-600" />
                                <span className="text-sm text-slate-700">{s.name}</span>
                            </label>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function ReportSkeleton() {
    return (
        <div className="space-y-4 animate-pulse">
            <div className="h-7 w-64 bg-slate-200 rounded-lg" />
            <div className="h-4 w-80 bg-slate-100 rounded" />
            <div className="bg-white rounded-3xl border border-slate-100 p-6 space-y-4">
                <div className="flex gap-2">
                    {[0, 1, 2, 3].map((i) => <div key={i} className="h-7 w-20 bg-slate-100 rounded-lg" />)}
                </div>
                <div className="h-[280px] bg-gradient-to-b from-slate-100 to-slate-50 rounded-2xl" />
            </div>
            <p className="text-center text-slate-400 text-sm font-medium">Generando reporte con datos en vivo…</p>
        </div>
    );
}

export default function ReporteGuardadoPage() {
    const params = useParams();
    const router = useRouter();
    const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

    const [data, setData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Parámetros interactivos (período, sucursales, filtros)
    const [paramValues, setParamValues] = useState<Record<string, string>>({});
    const [stores, setStores] = useState<StoreOption[]>([]);
    const [departments, setDepartments] = useState<string[]>([]);
    const initedParams = useRef(false);
    const dataRef = useRef<ReportData | null>(null);

    // Modo IA
    const [models, setModels] = useState<ModelOption[]>([]);
    const [analyzeModel, setAnalyzeModel] = useState<string>("");
    const [analyzing, setAnalyzing] = useState(false);
    const [ai, setAi] = useState<AiAnalysis | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);
    const [iaOn, setIaOn] = useState(false); // Modo IA: opcional, desactivado por defecto

    // Drill-down: detalle al hacer clic en una categoría
    const [drill, setDrill] = useState<{ title: string; visualization?: ReportViz; loading: boolean; rows: any[] | null; error: string | null } | null>(null);

    const openInAgent = () => {
        router.push(`${CONSOLE_PATH}?edit=${id}`);
    };

    const exportPdf = () => {
        const d = dataRef.current;
        if (!d?.definition) return;
        // Tablero → una tabla por bloque con datos; reporte simple → una sola tabla.
        const tables = d.blocks
            ? d.blocks.filter((b) => (b.rows?.length ?? 0) > 0).map((b) => ({ title: b.title, rows: b.rows }))
            : undefined;
        downloadPdf({
            question: d.title,
            analysis: d.definition.description || `Reporte: ${d.title}`,
            keyInsights: d.definition.insights,
            recommendations: d.definition.recommendations,
            data: tables ? undefined : (d.rows ?? []),
            tables,
            aiModel: d.modelo || undefined,
        });
    };

    useEffect(() => {
        if (!id) return;
        try { setIaOn(localStorage.getItem(`report_ia_${id}`) === "1"); } catch { /* noop */ }
    }, [id]);
    const toggleIa = useCallback(() => {
        setIaOn((v) => {
            const nv = !v;
            try { localStorage.setItem(`report_ia_${id}`, nv ? "1" : "0"); } catch { /* noop */ }
            return nv;
        });
    }, [id]);

    const loadData = useCallback(async (values?: Record<string, string>) => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            const qs = new URLSearchParams();
            if (values) for (const [k, v] of Object.entries(values)) if (v !== "") qs.set(k, v);
            const suffix = qs.toString() ? `?${qs.toString()}` : "";
            const resp = await fetch(`/api/agent/advanced/reports/${id}/data${suffix}`);
            const json = await resp.json();
            if (!resp.ok) throw new Error(json?.error || "No se pudo cargar el reporte");
            setData(json as ReportData);
            dataRef.current = json as ReportData;
            // Inicializa los valores de los controles con los defaults (una vez)
            if (!initedParams.current) {
                const defs: Record<string, string> = {};
                for (const p of (json.definition?.params || []) as ReportParam[]) defs[p.token] = p.defaultValue ?? "";
                setParamValues(defs);
                initedParams.current = true;
            }
        } catch (e: any) {
            setError(e?.message || "Error cargando el reporte");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { loadData(); }, [loadData]);

    // Catálogo de sucursales/departamentos + modelos para los controles
    useEffect(() => {
        (async () => {
            try {
                const [c, m] = await Promise.all([
                    fetch("/api/agent/advanced/catalog").then((r) => r.json()).catch(() => ({ stores: [] })),
                    fetch("/api/agent/advanced/models").then((r) => r.json()).catch(() => ({ models: [] })),
                ]);
                setStores(Array.isArray(c.stores) ? c.stores : []);
                setDepartments(Array.isArray(c.departments) ? c.departments : []);
                const list: ModelOption[] = Array.isArray(m.models) ? m.models : [];
                setModels(list);
                const saved = typeof window !== "undefined" ? localStorage.getItem("advanced_agent_model") : null;
                setAnalyzeModel((saved && list.some((x) => x.id === saved) ? saved : null) || m.defaultModelId || list[0]?.id || "");
            } catch { /* noop */ }
        })();
    }, []);

    const analyzeWithAI = useCallback(async () => {
        if (analyzing) return;
        setAnalyzing(true);
        setAiError(null);
        try {
            const r = await fetch(`/api/agent/advanced/reports/${id}/analyze`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: analyzeModel }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error || "Error analizando con IA");
            setAi(d as AiAnalysis);
        } catch (e: any) {
            setAiError(e?.message || "Error analizando con IA");
        } finally {
            setAnalyzing(false);
        }
    }, [id, analyzeModel, analyzing]);

    // Drill-down: re-consulta el detalle filtrado por el valor clickeado.
    const openDrill = useCallback(async (blockId: string | null, clicked: string) => {
        const d = dataRef.current;
        const definition = d?.definition;
        if (!definition || !id) return;
        const drillCfg = blockId
            ? definition.blocks?.find((b) => b.id === blockId)?.drill
            : definition.drill;
        const title = (drillCfg?.title || "Detalle: {{clicked}}").replace(/\{\{clicked\}\}/g, clicked);
        setDrill({ title, visualization: drillCfg?.visualization, loading: true, rows: null, error: null });
        try {
            const resp = await fetch(`/api/agent/advanced/reports/${id}/drill`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ blockId, clicked, params: paramValues }),
            });
            const json = await resp.json();
            if (!resp.ok) throw new Error(json?.error || "No se pudo cargar el detalle");
            setDrill((prev) => prev ? { ...prev, loading: false, rows: Array.isArray(json.rows) ? json.rows : [], visualization: json.visualization || prev.visualization } : prev);
        } catch (e: any) {
            setDrill((prev) => prev ? { ...prev, loading: false, error: e?.message || "Error obteniendo el detalle" } : prev);
        }
    }, [id, paramValues]);

    const def = data?.definition;
    const hasBlocks = Array.isArray(data?.blocks) && (data?.blocks?.length ?? 0) > 0;
    const reportParams = (def?.params || []) as ReportParam[];
    const setPv = (token: string, value: string) => setParamValues((prev) => ({ ...prev, [token]: value }));

    // Detección de rango de fechas para los botones de período
    const dateParams = reportParams.filter((p) => p.kind === "date");
    const startToken = dateParams.find((p) => /desde|inicio|start|from/i.test(p.token))?.token || dateParams[0]?.token;
    const endToken = dateParams.find((p) => /hasta|fin|end|to/i.test(p.token))?.token || dateParams[1]?.token;
    const hasRange = !!(startToken && endToken && startToken !== endToken);
    const applyPreset = (s: string, e: string) => {
        const nv = { ...paramValues, [startToken!]: s, [endToken!]: e };
        setParamValues(nv);
        loadData(nv);
    };

    return (
        <div className="space-y-6">
            <Link href={REPORTS_PATH} className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Mis Reportes
            </Link>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 font-medium">{error}</div>
            )}

            {data && def && (
                <>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                            <h1 className="text-2xl font-black tracking-tight text-slate-900">{data.title}</h1>
                            {data.descripcion && <p className="text-slate-500 font-medium mt-1">{data.descripcion}</p>}
                            <p className="text-[11px] text-slate-400 mt-2">
                                {hasBlocks ? `${data.blocks!.length} bloque(s)` : `${data.rowCount ?? 0} fila(s)`} · creado {new Date(data.fechaCreacion).toLocaleDateString("es-MX", { dateStyle: "medium" })}
                                {data.cost?.realCostoMxn != null && ` · creación: $${data.cost.realCostoMxn.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN (única vez; abrirlo no cuesta)`}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={exportPdf}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-100 transition-colors"
                                title="Exportar el reporte a PDF">
                                <FileDown className="w-4 h-4" /> PDF
                            </button>
                            <button onClick={openInAgent}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 transition-colors whitespace-nowrap"
                                title="Modifícalo por comandos: cambiar gráfica, filtros, mostrar cantidades/porcentaje, etc.">
                                <Wand2 className="w-4 h-4" /> Editar con el Agente Avanzado
                            </button>
                        </div>
                    </div>

                    {/* Controles interactivos (período, sucursales, filtros) */}
                    {reportParams.length > 0 && (
                        <div className="bg-white rounded-3xl border border-slate-100 p-5">
                            <h3 className="text-sm font-black uppercase tracking-wider text-slate-500 flex items-center gap-2 mb-4">
                                <SlidersHorizontal className="w-4 h-4" /> Filtros del reporte
                            </h3>
                            {hasRange && (
                                <div className="flex flex-wrap gap-1.5 mb-4">
                                    <span className="text-[11px] text-slate-400 self-center mr-1">Período:</span>
                                    {periodPresets().map((p) => (
                                        <button key={p.label} onClick={() => applyPreset(p.start, p.end)}
                                            className="px-3 py-1.5 rounded-full text-[12px] font-medium bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700 transition-colors">
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="flex flex-wrap gap-4 items-end">
                                {reportParams.map((p) => (
                                    <div key={p.token} className="min-w-[160px]">
                                        <label className="block text-[11px] font-bold text-slate-500 mb-1">{p.label}</label>
                                        {p.kind === "date" && (
                                            <input type="date" value={paramValues[p.token] || ""} onChange={(e) => setPv(p.token, e.target.value)}
                                                className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 outline-none focus:border-indigo-400" />
                                        )}
                                        {p.kind === "number" && (
                                            <input type="number" value={paramValues[p.token] || ""} onChange={(e) => setPv(p.token, e.target.value)}
                                                className="w-28 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 outline-none focus:border-indigo-400" />
                                        )}
                                        {p.kind === "text" && isDeptParam(p) && departments.length > 0 ? (
                                            <div className="flex flex-wrap gap-1.5 max-w-2xl">
                                                <button onClick={() => setPv(p.token, "")} className={`px-2.5 py-1 rounded-full text-[12px] border transition-colors ${(paramValues[p.token] || "") === "" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"}`}>Todos</button>
                                                {departments.map((dep) => (
                                                    <button key={dep} onClick={() => setPv(p.token, dep)} className={`px-2.5 py-1 rounded-full text-[12px] border transition-colors ${paramValues[p.token] === dep ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"}`}>{dep}</button>
                                                ))}
                                            </div>
                                        ) : p.kind === "text" ? (
                                            <input type="text" value={paramValues[p.token] || ""} onChange={(e) => setPv(p.token, e.target.value)} placeholder="(todos)"
                                                className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 outline-none focus:border-indigo-400 placeholder:text-slate-300" />
                                        ) : null}
                                        {p.kind === "storeList" && (
                                            <StoreMultiSelect stores={stores} value={paramValues[p.token] || ""} onChange={(v) => setPv(p.token, v)} />
                                        )}
                                    </div>
                                ))}
                                <button onClick={() => loadData(paramValues)} disabled={loading}
                                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                                    {loading ? "Aplicando…" : "Aplicar"}
                                </button>
                            </div>
                        </div>
                    )}

                    {hasBlocks ? (
                        /* ── Tablero multi-bloque: un control global de filtros mueve todos los bloques ── */
                        loading ? (
                            <div className="h-[280px] bg-gradient-to-b from-slate-100 to-slate-50 rounded-2xl animate-pulse" />
                        ) : (
                            <div className="space-y-6">
                                {data.blocks!.map((b) => <ReportBlockView key={b.id} block={b} onDrill={(v) => openDrill(b.id, v)} />)}
                            </div>
                        )
                    ) : (
                        <>
                            {/* Tarjetas KPI (calculadas sobre los datos actuales) */}
                            {def.kpis && def.kpis.length > 0 && (data.rows?.length ?? 0) > 0 && !loading && (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {def.kpis.map((k, i) => (
                                        <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4">
                                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">{k.label}</div>
                                            <div className="text-2xl font-black text-slate-900 tabular-nums mt-1">{fmtKpiVal(computeKpi(data.rows ?? [], k), k.format)}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Datos + visualización */}
                            <div className="bg-white rounded-3xl border border-slate-100 p-4 md:p-6">
                                {loading ? (
                                    <div className="h-[280px] bg-gradient-to-b from-slate-100 to-slate-50 rounded-2xl animate-pulse" />
                                ) : (data.rows?.length ?? 0) > 0 ? (
                                    <ReportDataView
                                        data={data.rows ?? []}
                                        suggestedViz={def.visualization}
                                        question={data.title}
                                        lockViz={def.chartConfig?.lockViz}
                                        showValues={def.chartConfig?.showValues}
                                        showPercent={def.chartConfig?.showPercent}
                                        alsoTable={def.chartConfig?.withTable}
                                        onDrill={def.drill ? (v) => openDrill(null, v) : undefined}
                                    />
                                ) : (
                                    <p className="text-slate-400 font-medium py-8 text-center">El reporte no devolvió datos con los filtros actuales.</p>
                                )}
                            </div>
                        </>
                    )}

                    {/* Modo IA (opcional, toggle, desactivado por defecto) */}
                    <div className="bg-gradient-to-br from-indigo-50 to-white rounded-3xl border border-indigo-100 p-5">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-wider text-indigo-600 flex items-center gap-2">
                                    <Sparkles className="w-4 h-4" /> Modo IA
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">Opcional. Actívalo para que la IA lea los datos actuales. El reporte por sí solo no usa IA.</p>
                            </div>
                            {/* Toggle */}
                            <button onClick={toggleIa} role="switch" aria-checked={iaOn}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${iaOn ? "bg-indigo-600" : "bg-slate-300"}`}>
                                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${iaOn ? "translate-x-5" : "translate-x-0.5"}`} />
                            </button>
                        </div>

                        {iaOn && (
                            <div className="mt-4 flex items-center gap-2 flex-wrap">
                                <select value={analyzeModel} onChange={(e) => setAnalyzeModel(e.target.value)} disabled={analyzing}
                                    className="text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 outline-none focus:border-indigo-400 disabled:opacity-50 cursor-pointer">
                                    {models.length === 0 && <option value="">(cargando…)</option>}
                                    {models.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
                                </select>
                                <button onClick={analyzeWithAI} disabled={analyzing || ((data.rows?.length ?? 0) === 0 && !hasBlocks)}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                    {analyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando…</> : <><Sparkles className="w-4 h-4" /> Analizar con IA</>}
                                </button>
                            </div>
                        )}
                        {iaOn && aiError && <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm font-medium">{aiError}</div>}
                        {iaOn && ai && (
                            <div className="mt-4 space-y-4 border-t border-indigo-100 pt-4">
                                <p className="text-[15px] leading-relaxed text-slate-700 font-medium">{renderBold(ai.narrative)}</p>
                                {ai.insights?.length > 0 && (
                                    <ul className="space-y-1.5">
                                        {ai.insights.map((it, i) => (<li key={i} className="text-slate-700 text-sm flex gap-2"><span className="text-indigo-400">•</span><span>{renderBold(it)}</span></li>))}
                                    </ul>
                                )}
                                {ai.recommendations?.length > 0 && (
                                    <ul className="space-y-1.5">
                                        {ai.recommendations.map((it, i) => (<li key={i} className="text-slate-700 text-sm flex gap-2"><span className="text-emerald-500">→</span><span>{renderBold(it)}</span></li>))}
                                    </ul>
                                )}
                                <span className="inline-block text-[11px] font-bold text-slate-400 bg-white border border-slate-200 rounded-full px-2.5 py-1">
                                    Analizado con {ai.modelLabel} · ${ai.cost.costMxn.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Hallazgos guardados al crear el reporte */}
                    {def.insights?.length > 0 && (
                        <div className="bg-white rounded-3xl border border-slate-100 p-5">
                            <h3 className="text-sm font-black uppercase tracking-wider text-slate-500 flex items-center gap-2 mb-3">
                                <Lightbulb className="w-4 h-4" /> Hallazgos al crear el reporte
                            </h3>
                            <ul className="space-y-2">
                                {def.insights.map((it, i) => (<li key={i} className="text-slate-700 font-medium flex gap-2"><span className="text-indigo-400">•</span> <span>{renderBold(it)}</span></li>))}
                            </ul>
                        </div>
                    )}

                    {def.recommendations?.length > 0 && (
                        <div className="bg-white rounded-3xl border border-slate-100 p-5">
                            <h3 className="text-sm font-black uppercase tracking-wider text-emerald-600 flex items-center gap-2 mb-3">
                                <Target className="w-4 h-4" /> Acciones recomendadas
                            </h3>
                            <ul className="space-y-2">
                                {def.recommendations.map((it, i) => (<li key={i} className="text-slate-700 font-medium flex gap-2"><span className="text-emerald-400">→</span> <span>{renderBold(it)}</span></li>))}
                            </ul>
                        </div>
                    )}
                </>
            )}

            {!data && loading && <ReportSkeleton />}

            {/* Modal de drill-down (detalle de la categoría clickeada) */}
            {drill && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDrill(null)}>
                    <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                            <h4 className="font-black text-slate-800 text-sm tracking-tight">{drill.title}</h4>
                            <button onClick={() => setDrill(null)} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
                        </div>
                        <div className="p-5 overflow-auto">
                            {drill.loading ? (
                                <div className="h-[220px] bg-gradient-to-b from-slate-100 to-slate-50 rounded-2xl animate-pulse" />
                            ) : drill.error ? (
                                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm font-medium">{drill.error}</div>
                            ) : drill.rows && drill.rows.length > 0 ? (
                                <ReportDataView data={drill.rows} suggestedViz={drill.visualization} question={drill.title} />
                            ) : (
                                <p className="text-slate-400 font-medium py-8 text-center">Sin detalle para este elemento.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
