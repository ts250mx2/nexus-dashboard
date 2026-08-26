"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, FileBarChart, Plus, RefreshCw, Search, Copy, FolderPlus, Folder, X, Layers } from "lucide-react";

interface ReportItem {
    idReporte: number;
    titulo: string;
    descripcion: string | null;
    visualization: string | null;
    blockCount?: number;
    modelo: string | null;
    idFolder: number | null;
    fechaCreacion: string;
}
interface FolderItem { idFolder: number; nombre: string; }

const CONSOLE_PATH = "/dashboard/reportes-ia/agente-avanzado";
const REPORTS_PATH = "/dashboard/reportes-ia/mis-reportes";

const VIZ_EMOJI: Record<string, string> = { bar: "📊", line: "📈", pie: "🥧", area: "🌄", table: "📋", treemap: "🟦" };
const MODEL_LABELS: Record<string, string> = {
    "claude-opus-5": "Opus 5", "claude-sonnet-5": "Sonnet 5",
    "claude-haiku-4-5-20251001": "Haiku 4.5",
    "gpt-4o": "GPT-4o",
};
const modelLabel = (id: string | null) => (id ? MODEL_LABELS[id] || id : null);
function fmtFecha(iso: string): string {
    try { return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }); } catch { return iso; }
}

export default function MisReportesPage() {
    const [reports, setReports] = useState<ReportItem[]>([]);
    const [folders, setFolders] = useState<FolderItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<number | null>(null);
    const [q, setQ] = useState("");
    const [selected, setSelected] = useState<number | "all" | null>("all"); // all | null(sin carpeta) | folderId
    const [dragOver, setDragOver] = useState<number | "root" | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [rr, fr] = await Promise.all([
                fetch("/api/agent/advanced/reports").then((r) => r.json()),
                fetch("/api/agent/advanced/folders").then((r) => r.json()),
            ]);
            setReports(Array.isArray(rr.reports) ? rr.reports : []);
            setFolders(Array.isArray(fr.folders) ? fr.folders : []);
        } catch (e: any) {
            setError(e?.message || "Error cargando");
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const handleDelete = useCallback(async (id: number) => {
        if (!confirm("¿Eliminar este reporte?")) return;
        setBusy(id);
        try {
            const resp = await fetch(`/api/agent/advanced/reports?id=${id}`, { method: "DELETE" });
            if (!resp.ok) throw new Error();
            setReports((prev) => prev.filter((r) => r.idReporte !== id));
        } catch { alert("No se pudo eliminar"); } finally { setBusy(null); }
    }, []);

    const handleClone = useCallback(async (id: number) => {
        setBusy(id);
        try {
            const resp = await fetch(`/api/agent/advanced/reports/${id}/clone`, { method: "POST" });
            const d = await resp.json();
            if (!resp.ok) throw new Error(d?.error);
            await load();
        } catch (e: any) { alert(e?.message || "No se pudo clonar"); } finally { setBusy(null); }
    }, [load]);

    const newFolder = useCallback(async () => {
        const nombre = prompt("Nombre de la carpeta:");
        if (!nombre || !nombre.trim()) return;
        try {
            const resp = await fetch("/api/agent/advanced/folders", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: nombre.trim() }),
            });
            if (!resp.ok) throw new Error();
            await load();
        } catch { alert("No se pudo crear la carpeta"); }
    }, [load]);

    const removeFolder = useCallback(async (id: number) => {
        if (!confirm("¿Eliminar la carpeta? Sus reportes volverán a 'Sin carpeta' (no se borran).")) return;
        try {
            await fetch(`/api/agent/advanced/folders?id=${id}`, { method: "DELETE" });
            if (selected === id) setSelected("all");
            await load();
        } catch { alert("No se pudo eliminar la carpeta"); }
    }, [load, selected]);

    const moveReport = useCallback(async (reportId: number, folderId: number | null) => {
        setReports((prev) => prev.map((r) => (r.idReporte === reportId ? { ...r, idFolder: folderId } : r)));
        try {
            await fetch(`/api/agent/advanced/reports/${reportId}/move`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderId }),
            });
        } catch { load(); }
    }, [load]);

    const onDrop = (folderId: number | null) => (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(null);
        const rid = Number(e.dataTransfer.getData("text/plain"));
        if (Number.isFinite(rid)) moveReport(rid, folderId);
    };
    const allowDrop = (key: number | "root") => (e: React.DragEvent) => { e.preventDefault(); setDragOver(key); };

    const qn = q.trim().toLowerCase();
    const visible = reports.filter((r) => {
        if (selected === "all") { /* todos */ }
        else if (selected === null) { if (r.idFolder != null) return false; }
        else { if (r.idFolder !== selected) return false; }
        if (qn && !(r.titulo.toLowerCase().includes(qn) || (r.descripcion || "").toLowerCase().includes(qn))) return false;
        return true;
    });
    const countIn = (fid: number | null) => reports.filter((r) => r.idFolder === fid).length;

    const chipBase = "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border transition-colors cursor-pointer";
    const chipCls = (active: boolean, over: boolean) =>
        `${chipBase} ${over ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200" : active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"}`;

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2"><span>📁</span> Mis Reportes</h1>
                    <p className="text-slate-500 font-medium mt-1">Arrastra un reporte a una carpeta para organizarlo.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={load} className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors" title="Recargar"><RefreshCw className="w-4 h-4" /></button>
                    <Link href={CONSOLE_PATH} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors"><Plus className="w-4 h-4" /> Crear reporte</Link>
                </div>
            </div>

            {/* Barra de carpetas (también son zonas para soltar) */}
            <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setSelected("all")} className={chipCls(selected === "all", false)}>
                    <Layers className="w-4 h-4" /> Todos <span className="text-[11px] opacity-70">({reports.length})</span>
                </button>
                <button
                    onClick={() => setSelected(null)}
                    onDragOver={allowDrop("root")} onDragLeave={() => setDragOver(null)} onDrop={onDrop(null)}
                    className={chipCls(selected === null, dragOver === "root")}
                    title="Soltar aquí para quitar de la carpeta"
                >
                    <Folder className="w-4 h-4" /> Sin carpeta <span className="text-[11px] opacity-70">({countIn(null)})</span>
                </button>
                {folders.map((f) => (
                    <div
                        key={f.idFolder}
                        onClick={() => setSelected(f.idFolder)}
                        onDragOver={allowDrop(f.idFolder)} onDragLeave={() => setDragOver(null)} onDrop={onDrop(f.idFolder)}
                        className={chipCls(selected === f.idFolder, dragOver === f.idFolder)}
                        title="Soltar un reporte aquí para moverlo a esta carpeta"
                    >
                        <Folder className="w-4 h-4" /> {f.nombre} <span className="text-[11px] opacity-70">({countIn(f.idFolder)})</span>
                        <button onClick={(e) => { e.stopPropagation(); removeFolder(f.idFolder); }} className="ml-1 opacity-50 hover:opacity-100 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                    </div>
                ))}
                <button onClick={newFolder} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                    <FolderPlus className="w-4 h-4" /> Nueva carpeta
                </button>
            </div>

            {/* Búsqueda */}
            {!loading && reports.length > 0 && (
                <div className="relative max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o descripción…"
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 outline-none focus:border-indigo-400 placeholder:text-slate-400" />
                </div>
            )}

            {loading && <div className="text-slate-400 font-medium py-16 text-center">Cargando reportes…</div>}
            {error && !loading && <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 font-medium">{error}</div>}

            {!loading && !error && reports.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center py-20 bg-white rounded-3xl border border-slate-100">
                    <FileBarChart className="w-12 h-12 text-slate-300 mb-4" />
                    <h2 className="text-lg font-black text-slate-700">Aún no tienes reportes</h2>
                    <p className="text-slate-500 font-medium max-w-sm mt-1">Usa el Agente Avanzado para crear tu primer reporte hablando en lenguaje natural.</p>
                    <Link href={CONSOLE_PATH} className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors"><Plus className="w-4 h-4" /> Crear mi primer reporte</Link>
                </div>
            )}

            {!loading && reports.length > 0 && visible.length === 0 && (
                <div className="text-slate-400 font-medium py-10 text-center">{qn ? `Sin resultados para “${q}”.` : "No hay reportes aquí. Arrastra alguno a esta carpeta."}</div>
            )}

            {!loading && visible.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {visible.map((r) => (
                        <div
                            key={r.idReporte}
                            draggable
                            onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(r.idReporte)); e.dataTransfer.effectAllowed = "move"; }}
                            className="group bg-white rounded-3xl border border-slate-100 hover:border-indigo-300 hover:shadow-xl transition-all overflow-hidden flex flex-col cursor-grab active:cursor-grabbing"
                        >
                            <Link href={`${REPORTS_PATH}/${r.idReporte}`} className="flex-1 p-5">
                                <div className="flex items-start justify-between gap-2">
                                    <span className="text-2xl">{(r.blockCount ?? 0) > 1 ? "🗂️" : (VIZ_EMOJI[r.visualization || "table"] || "📋")}</span>
                                </div>
                                <h3 className="font-black text-slate-800 mt-3 leading-tight group-hover:text-indigo-700">{r.titulo}</h3>
                                {r.descripcion && <p className="text-sm text-slate-500 mt-1.5 line-clamp-2">{r.descripcion}</p>}
                                <div className="flex items-center flex-wrap gap-2 mt-3">
                                    <p className="text-[11px] text-slate-400">{fmtFecha(r.fechaCreacion)}</p>
                                    {(r.blockCount ?? 0) > 1 && (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-100 rounded-full px-2 py-0.5"><Layers className="w-3 h-3" /> Tablero · {r.blockCount}</span>
                                    )}
                                    {modelLabel(r.modelo) && (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5">🧠 {modelLabel(r.modelo)}</span>
                                    )}
                                </div>
                            </Link>
                            <div className="px-5 py-3 border-t border-slate-50 flex items-center justify-between">
                                <Link href={`${REPORTS_PATH}/${r.idReporte}`} className="text-sm font-bold text-indigo-600 hover:text-indigo-700">Abrir →</Link>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => handleClone(r.idReporte)} disabled={busy === r.idReporte} className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50" title="Clonar (copia)"><Copy className="w-4 h-4" /></button>
                                    <button onClick={() => handleDelete(r.idReporte)} disabled={busy === r.idReporte} className="p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
