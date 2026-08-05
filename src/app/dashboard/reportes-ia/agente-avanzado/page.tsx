"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X, Plus, Maximize2, Minimize2, Eraser } from "lucide-react";
import { readSseStream } from "@/lib/sse-client";

type LogKind =
    | "user" | "system" | "phase" | "reasoning" | "question"
    | "tool-call" | "sql" | "tool-result" | "report-proposed" | "report-saved" | "error" | "done";

interface LogLine { id: string; kind: LogKind; text: string; href?: string; }
interface ModelOption { id: string; label: string; provider: string; inputUsdPerMTok: number; outputUsdPerMTok: number; }
interface Proposal {
    title?: string; description?: string; sql?: string; visualization?: string;
    expectedColumns?: any[]; insights?: string[]; recommendations?: string[]; suggestedQuestions?: string[]; params?: any[];
    blocks?: any[]; complexity?: string; recommendedModel?: string;
}
interface Session {
    id: string;
    title: string;
    lines: LogLine[];
    history: Array<{ role: "user" | "assistant"; content: string }>;
    input: string;
    suggestions: string[];
    savedUrl: string | null;
    proposal: Proposal | null;
    busy: boolean;
    editingReportId?: number | null; // si está editando un reporte existente
    editingTitle?: string;
    pendingCmd?: string;             // comando a auto-enviar al sembrar la sesión
}

const CONSOLE_PATH = "/dashboard/reportes-ia/agente-avanzado";
const REPORTS_PATH = "/dashboard/reportes-ia/mis-reportes";

const KIND_STYLE: Record<LogKind, string> = {
    user: "text-sky-300", system: "text-slate-500", phase: "text-cyan-400", reasoning: "text-slate-300",
    question: "text-yellow-200 font-bold", "tool-call": "text-amber-300", sql: "text-emerald-400/80",
    "tool-result": "text-slate-400", "report-proposed": "text-indigo-300 font-bold", "report-saved": "text-emerald-300 font-bold",
    error: "text-red-400", done: "text-slate-500",
};
const PREFIX: Record<LogKind, string> = {
    user: "$ ", system: "· ", phase: "» ", reasoning: "  ", question: "? ", "tool-call": "▸ ", sql: "  ",
    "tool-result": "  ✓ ", "report-proposed": "◆ ", "report-saved": "★ ", error: "✖ ", done: "— ",
};

let lineCounter = 0;
const newId = () => `l${++lineCounter}_${Date.now().toString(36)}_${Math.round(performance.now())}`;
const fmtMxn = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtUsd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

const sigOf = (s: Session) => `${s.title}|${s.lines.length}|${s.history.length}|${s.editingReportId ?? ""}|${s.lines[s.lines.length - 1]?.id || ""}`;
const VIZ_LABELS: Record<string, string> = { bar: "Barras", line: "Línea", area: "Área", pie: "Pastel", treemap: "Rectángulos", table: "Tabla" };
const PARAM_KIND_LABELS: Record<string, string> = { date: "fecha", storeList: "sucursales", text: "texto/búsqueda", number: "número" };
const QUICK_PARAMS = ["Filtro por producto", "Filtro por proveedor", "Filtro por profesor", "Filtro por categoría", "Comparar vs período anterior"];
const BUILD_EST_IN = 2500;
const BUILD_EST_OUT = 700;
const USD_MXN = 18.5;

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const THINKING_MSGS = ["Pensando", "Analizando tu petición", "Consultando datos", "Afinando el reporte", "Casi listo"];

function ThinkingIndicator({ label }: { label?: string }) {
    const [frame, setFrame] = useState(0);
    const [msgIdx, setMsgIdx] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setFrame((x) => (x + 1) % SPINNER_FRAMES.length), 80);
        return () => clearInterval(t);
    }, []);
    useEffect(() => {
        if (label) return; // si hay fase real, no rotamos mensajes
        const t = setInterval(() => setMsgIdx((x) => (x + 1) % THINKING_MSGS.length), 2200);
        return () => clearInterval(t);
    }, [label]);
    const text = label || THINKING_MSGS[msgIdx];
    return (
        <div className="flex items-center gap-2 py-1.5 text-emerald-300">
            <span className="text-emerald-400 text-[15px] leading-none w-4 inline-block">{SPINNER_FRAMES[frame]}</span>
            <span className="font-bold animate-pulse">{text}</span>
            <span className="flex gap-1 ml-0.5">
                {[0, 1, 2].map((i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 animate-bounce" style={{ animationDelay: `${i * 160}ms` }} />
                ))}
            </span>
        </div>
    );
}

function freshSession(): Session {
    return {
        id: `s_${Date.now().toString(36)}_${Math.round(performance.now())}`,
        title: "Agente 1",
        lines: [{ id: newId(), kind: "system", text: "Cuéntame qué reporte necesitas; te haré preguntas y sugerencias. El costo aparece solo al crearlo." }],
        history: [], input: "", suggestions: [], savedUrl: null, proposal: null, busy: false,
    };
}

export default function AgenteAvanzadoPage() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [activeId, setActiveId] = useState<string>("");
    const [ready, setReady] = useState(false);
    const [models, setModels] = useState<ModelOption[]>([]);
    const [maximized, setMaximized] = useState(false);
    const [convModel, setConvModel] = useState("");

    // Estado del modal de armado (de la sesión activa)
    const [buildName, setBuildName] = useState("");
    const [buildModel, setBuildModel] = useState("");
    const [building, setBuilding] = useState(false);
    const [buildError, setBuildError] = useState<string | null>(null);
    const [refineText, setRefineText] = useState("");

    const controllers = useRef<Record<string, AbortController>>({});
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const savedSig = useRef<Record<string, string>>({});

    const active = sessions.find((s) => s.id === activeId) || null;

    // --- Carga inicial desde la BD (por IdUsuario) ---
    useEffect(() => {
        (async () => {
            let loaded: Session[] = [];
            try {
                const r = await fetch("/api/agent/advanced/sessions");
                const d = await r.json();
                if (Array.isArray(d.sessions)) {
                    loaded = d.sessions.map((s: any, i: number) => ({
                        id: s.id || `s_${i}`,
                        title: s.title || `Agente ${i + 1}`,
                        lines: Array.isArray(s.lines) ? s.lines.slice(-150) : [],
                        history: Array.isArray(s.history) ? s.history : [],
                        input: "", suggestions: [], savedUrl: null, proposal: null, busy: false,
                        editingReportId: s.editingReportId ?? null,
                    }));
                }
            } catch { /* sin conexión: arrancamos en blanco */ }
            if (loaded.length === 0) loaded = [freshSession()];
            for (const s of loaded) savedSig.current[s.id] = sigOf(s);

            // ¿Venimos a EDITAR un reporte? (?edit=<id>&cmd=<comando>)
            let activeTarget = loaded[0].id;
            try {
                const sp = new URLSearchParams(window.location.search);
                const editId = sp.get("edit");
                const cmd = sp.get("cmd");
                const existing = editId ? loaded.find((s) => s.editingReportId === Number(editId)) : null;
                if (editId && existing) {
                    // Ya existe una pestaña editando este reporte: reúsala (no crear otra)
                    activeTarget = existing.id;
                } else if (editId) {
                    const r = await fetch(`/api/agent/advanced/reports/${editId}/data`);
                    const d = await r.json();
                    if (d?.definition) {
                        const defLite = {
                            title: d.title,
                            description: d.definition.description,
                            sql: d.definition.sql,
                            visualization: d.definition.visualization,
                            params: d.definition.params,
                            expectedColumns: d.definition.expectedColumns,
                        };
                        const sess: Session = {
                            ...freshSession(),
                            title: `Editar: ${String(d.title || "Reporte").slice(0, 16)}`,
                            editingReportId: Number(editId),
                            editingTitle: d.title,
                            lines: [{ id: newId(), kind: "system", text: `Editando el reporte "${d.title}". Dime el cambio (ej. "agrégale filtro por sucursal", "cámbialo a treemap", "agrúpalo por semana") y lo aplico.` }],
                            history: [
                                { role: "user", content: `Reporte EXISTENTE que quiero editar: ${JSON.stringify(defLite).slice(0, 3500)}. Cuando te pida un cambio, vuelve a proponerlo COMPLETO y actualizado con propose_report, conservando lo que no cambie.` },
                                { role: "assistant", content: `Listo, tengo el reporte "${d.title}". ¿Qué cambio le hago?` },
                            ],
                            pendingCmd: cmd || undefined,
                        };
                        loaded = [sess, ...loaded];
                        activeTarget = sess.id;
                        // Persistir YA (con editingReportId) para que el próximo "Editar" reúse esta pestaña.
                        savedSig.current[sess.id] = sigOf(sess);
                        fetch("/api/agent/advanced/sessions", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: sess.id, title: sess.title, lines: sess.lines, history: sess.history, editingReportId: sess.editingReportId }),
                        }).catch(() => { });
                    }
                }
                if (editId || cmd) window.history.replaceState({}, "", CONSOLE_PATH);
            } catch { /* noop */ }

            setSessions(loaded);
            setActiveId(activeTarget);
            setReady(true);
        })();
    }, []);

    // --- Persistencia en BD (debounce; solo lo que cambió) ---
    useEffect(() => {
        if (!ready) return;
        const t = setTimeout(() => {
            for (const s of sessions) {
                const sig = sigOf(s);
                if (savedSig.current[s.id] !== sig) {
                    savedSig.current[s.id] = sig;
                    fetch("/api/agent/advanced/sessions", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: s.id, title: s.title, lines: s.lines.slice(-150), history: s.history.slice(-16), editingReportId: s.editingReportId ?? null }),
                    }).catch(() => { });
                }
            }
        }, 1200);
        return () => clearTimeout(t);
    }, [sessions, ready]);

    // --- Modelos para el selector de conversación y el modal de armado ---
    useEffect(() => {
        (async () => {
            try {
                const r = await fetch("/api/agent/advanced/models");
                const d = await r.json();
                const list: ModelOption[] = Array.isArray(d.models) ? d.models : [];
                setModels(list);
                const saved = localStorage.getItem("advanced_agent_model");
                setBuildModel((saved && list.some((m) => m.id === saved) ? saved : null) || d.defaultModelId || list[0]?.id || "");
                const savedConv = localStorage.getItem("advanced_conv_model");
                setConvModel((savedConv && list.some((m) => m.id === savedConv) ? savedConv : null) || "claude-sonnet-5");
            } catch { /* noop */ }
        })();
    }, []);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [active?.lines, active?.busy]);

    // Salir de pantalla completa con ESC
    useEffect(() => {
        if (!maximized) return;
        const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setMaximized(false); };
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, [maximized]);

    // Cuando la sesión activa tiene una propuesta: prellena nombre y pre-selecciona
    // el modelo recomendado según la complejidad.
    useEffect(() => {
        if (active?.proposal) {
            setBuildName(active.proposal.title || "");
            if (active.proposal.recommendedModel) setBuildModel(active.proposal.recommendedModel);
            setBuildError(null);
        }
    }, [active?.proposal, activeId]);

    const updateSession = useCallback((sid: string, updater: (s: Session) => Session) => {
        setSessions((prev) => prev.map((s) => (s.id === sid ? updater(s) : s)));
    }, []);
    const pushLine = useCallback((sid: string, kind: LogKind, text: string, href?: string) => {
        updateSession(sid, (s) => ({ ...s, lines: [...s.lines, { id: newId(), kind, text, href }] }));
    }, [updateSession]);

    const executeRun = useCallback(async (sid: string, prompt: string) => {
        const controller = new AbortController();
        controllers.current[sid]?.abort();
        controllers.current[sid] = controller;
        let assistantText = "";
        const histAtStart = sessions.find((s) => s.id === sid)?.history || [];

        try {
            const resp = await fetch("/api/agent/advanced/run?stream=true", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt, history: histAtStart, model: convModel || undefined }),
                signal: controller.signal,
            });
            if (!resp.ok && !resp.headers.get("content-type")?.includes("text/event-stream")) {
                const err = await resp.json().catch(() => ({}));
                pushLine(sid, "error", err?.error || "No se pudo iniciar.");
                updateSession(sid, (s) => ({ ...s, busy: false }));
                return;
            }
            for await (const evt of readSseStream(resp, controller.signal)) {
                switch (evt.event) {
                    case "status": if (evt.data?.detail) pushLine(sid, "phase", evt.data.detail); break;
                    case "reasoning": {
                        const t = String(evt.data?.text || "").trim();
                        if (t) { assistantText += (assistantText ? "\n" : "") + t; pushLine(sid, "reasoning", t); }
                        break;
                    }
                    case "clarification": {
                        const q = String(evt.data?.question || "").trim();
                        const sugg = Array.isArray(evt.data?.suggestions) ? evt.data.suggestions : [];
                        if (q) { assistantText += (assistantText ? "\n" : "") + q; pushLine(sid, "question", q); }
                        updateSession(sid, (s) => ({ ...s, suggestions: sugg }));
                        break;
                    }
                    case "tool-call": pushLine(sid, "tool-call", `tool: ${evt.data?.name}`); break;
                    case "sql": pushLine(sid, "sql", String(evt.data?.sql || "").trim()); break;
                    case "tool-result":
                        if (evt.data?.ok) pushLine(sid, "tool-result", `${evt.data?.name}${typeof evt.data?.rowCount === "number" ? ` — ${evt.data.rowCount} fila(s)` : ""}`);
                        else pushLine(sid, "error", `${evt.data?.name} falló: ${evt.data?.error || "error"}`);
                        break;
                    case "report-proposed": {
                        const def = {
                            ...(evt.data?.definition || {}),
                            complexity: evt.data?.complexity,
                            recommendedModel: evt.data?.recommendedModel,
                        } as Proposal;
                        const editingId = sessions.find((s) => s.id === sid)?.editingReportId;
                        if (editingId) {
                            // EDICIÓN: se reescribe directo (sin modal, sin costo) y te manda a verlo.
                            assistantText += (assistantText ? "\n" : "") + `Aplicando cambios a "${def.title || "el reporte"}".`;
                            pushLine(sid, "phase", "Aplicando cambios al reporte…");
                            try {
                                const r = await fetch("/api/agent/advanced/build", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ definition: def, name: def.title, model: def.recommendedModel || "claude-sonnet-5", idReporte: editingId, mode: "overwrite" }),
                                });
                                const d = await r.json();
                                if (!r.ok) throw new Error(d?.error || "No se pudo actualizar");
                                const costTxt = d.presentationOnly ? "solo presentación, sin costo" : `${fmtMxn(d?.cost?.costMxn || 0)} MXN`;
                                pushLine(sid, "report-saved", `REPORTE ACTUALIZADO: ${d.title || def.title} · ${costTxt}`, d.url);
                                updateSession(sid, (s) => ({ ...s, savedUrl: d.url || null, suggestions: Array.isArray(def.suggestedQuestions) ? def.suggestedQuestions : [] }));
                            } catch (e: any) {
                                pushLine(sid, "error", `No se pudo actualizar el reporte: ${e?.message || "error"}`);
                            }
                        } else {
                            // NUEVO reporte: abre el modal de costo/nombre/modelo
                            assistantText += (assistantText ? "\n" : "") + `Reporte propuesto: ${def.title || "(sin título)"}`;
                            pushLine(sid, "report-proposed", `Propuesta lista: ${def.title || "Reporte"}. Revisa nombre, modelo y costo para crearlo.`);
                            updateSession(sid, (s) => ({ ...s, proposal: def, suggestions: Array.isArray(def.suggestedQuestions) ? def.suggestedQuestions : [], title: (def.title || s.title).slice(0, 24) }));
                        }
                        break;
                    }
                    case "error": pushLine(sid, "error", evt.data?.message || "Error en la ejecución."); break;
                }
            }
            updateSession(sid, (s) => ({
                ...s,
                history: [...s.history, { role: "user" as const, content: prompt }, { role: "assistant" as const, content: assistantText || "(sin texto)" }].slice(-16),
            }));
        } catch (e: any) {
            if (e?.name !== "AbortError") pushLine(sid, "error", `Error de conexión: ${e?.message || "desconocido"}`);
        } finally {
            updateSession(sid, (s) => ({ ...s, busy: false }));
        }
    }, [sessions, pushLine, updateSession, convModel]);

    const handleSend = useCallback((text?: string) => {
        if (!active) return;
        const sid = active.id;
        const prompt = (text ?? active.input).trim();
        if (!prompt || active.busy) return;
        updateSession(sid, (s) => ({ ...s, busy: true, input: "", suggestions: [], savedUrl: null, lines: [...s.lines, { id: newId(), kind: "user", text: prompt }] }));
        executeRun(sid, prompt);
    }, [active, updateSession, executeRun]);

    // Auto-envía el comando inicial cuando se siembra una sesión de edición (?cmd)
    useEffect(() => {
        if (!ready || !active || !active.pendingCmd || active.busy) return;
        const cmd = active.pendingCmd;
        updateSession(active.id, (s) => ({ ...s, pendingCmd: undefined }));
        handleSend(cmd);
    }, [ready, active, handleSend, updateSession]);

    const buildReport = useCallback(async () => {
        if (!active?.proposal || building) return;
        const sid = active.id;
        const proposal = active.proposal;
        const name = buildName.trim() || proposal.title || "Reporte sin título";
        setBuilding(true);
        setBuildError(null);
        try {
            const r = await fetch("/api/agent/advanced/build", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ definition: proposal, name, model: buildModel }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error || "No se pudo crear el reporte");
            if (buildModel) localStorage.setItem("advanced_agent_model", buildModel);
            pushLine(sid, "report-saved", `REPORTE CREADO: ${d.title || name} · ${fmtMxn(d?.cost?.costMxn || 0)} MXN`, d.url);
            // Tras crearlo, futuros cambios en esta pestaña EDITAN ese reporte (sin modal/costo).
            updateSession(sid, (s) => ({ ...s, proposal: null, savedUrl: d.url || null, editingReportId: d.idReporte ?? s.editingReportId, editingTitle: d.title || s.editingTitle }));
        } catch (e: any) {
            setBuildError(e?.message || "Error creando el reporte");
        } finally {
            setBuilding(false);
        }
    }, [active, building, buildName, buildModel, pushLine, updateSession]);

    // Pide al agente AJUSTAR la propuesta (agregar parámetros/filtros) y re-proponer.
    const refineProposal = useCallback((text: string) => {
        const t = text.trim();
        if (!t || !active) return;
        updateSession(active.id, (s) => ({ ...s, proposal: null }));
        setRefineText("");
        handleSend(`Ajusta el reporte propuesto: ${t}. Vuelve a proponerlo (propose_report) con ese cambio.`);
    }, [active, updateSession, handleSend]);

    const addSession = useCallback(() => {
        setSessions((prev) => {
            const n = prev.length + 1;
            const s = { ...freshSession(), title: `Agente ${n}` };
            setActiveId(s.id);
            return [...prev, s];
        });
    }, []);

    const closeSession = useCallback((sid: string) => {
        controllers.current[sid]?.abort();
        fetch(`/api/agent/advanced/sessions?id=${encodeURIComponent(sid)}`, { method: "DELETE" }).catch(() => { });
        delete savedSig.current[sid];
        setSessions((prev) => {
            const remaining = prev.filter((s) => s.id !== sid);
            const next = remaining.length ? remaining : [freshSession()];
            setActiveId((cur) => (cur === sid ? next[0].id : cur));
            return next;
        });
    }, []);

    const clearChat = useCallback(() => {
        if (!active) return;
        controllers.current[active.id]?.abort();
        updateSession(active.id, (s) => ({
            ...s,
            // En sesiones de edición conservamos el contexto del reporte (primeros 2 mensajes).
            lines: [{ id: newId(), kind: "system", text: s.editingReportId ? `Editando "${s.editingTitle || "reporte"}". Dime el cambio y lo aplico.` : "Chat limpio. ¿Qué reporte necesitas?" }],
            history: s.editingReportId ? s.history.slice(0, 2) : [],
            suggestions: [], proposal: null, savedUrl: null, busy: false, input: "",
        }));
    }, [active, updateSession]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    const buildModelInfo = models.find((m) => m.id === buildModel);
    const estUsd = buildModelInfo ? (BUILD_EST_IN / 1e6) * buildModelInfo.inputUsdPerMTok + (BUILD_EST_OUT / 1e6) * buildModelInfo.outputUsdPerMTok : 0;
    const estMxn = estUsd * USD_MXN;

    if (!ready || !active) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] bg-[#0a0e14] rounded-2xl text-[#d6deeb] font-mono gap-3">
                <ThinkingIndicator label="Cargando el Agente Avanzado" />
                <p className="text-[11px] text-slate-600">Preparando tus conversaciones…</p>
            </div>
        );
    }

    return (
        <div className={`flex flex-col bg-[#0a0e14] text-[#d6deeb] font-mono text-[13px] ${maximized ? "fixed inset-0 z-[60]" : "h-[calc(100vh-10rem)] rounded-2xl overflow-hidden border border-slate-800 shadow-lg"}`}>
            {/* Pestañas de agentes */}
            <div className="flex items-center gap-1 px-2 pt-2 bg-[#0d1320] border-b border-white/10 shrink-0 overflow-x-auto">
                {sessions.map((s) => (
                    <div key={s.id} onClick={() => setActiveId(s.id)}
                        className={`group flex items-center gap-2 px-3 py-2 rounded-t-lg cursor-pointer whitespace-nowrap text-[12px] ${s.id === activeId ? "bg-[#0a0e14] text-emerald-300" : "bg-white/5 text-slate-400 hover:text-slate-200"}`}>
                        {s.busy && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
                        <span>{s.title}</span>
                        {sessions.length > 1 && (
                            <button onClick={(e) => { e.stopPropagation(); closeSession(s.id); }} className="opacity-40 group-hover:opacity-100 hover:text-red-400">
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                ))}
                <button onClick={addSession} className="px-2 py-2 text-slate-400 hover:text-emerald-300" title="Nuevo agente">
                    <Plus className="w-4 h-4" />
                </button>
                <div className="flex-1" />
                <button onClick={clearChat} title="Limpiar este chat" className="text-slate-400 hover:text-amber-300 text-[12px] px-2 self-center inline-flex items-center gap-1">
                    <Eraser className="w-3.5 h-3.5" /> Limpiar
                </button>
                <Link href={REPORTS_PATH} className="text-sky-400 hover:text-sky-300 text-[12px] px-3 self-center">Mis Reportes →</Link>
                <button onClick={() => setMaximized((m) => !m)} title={maximized ? "Restaurar (Esc)" : "Maximizar"} className="text-slate-400 hover:text-emerald-300 px-2 self-center">
                    {maximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
            </div>

            {/* Barra de carga indeterminada */}
            {active.busy && <div className="agent-loading-bar h-[3px] bg-emerald-500/10 shrink-0" />}

            {/* Logs de la sesión activa */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1 leading-relaxed">
                {active.lines.map((l) => (
                    <div key={l.id} className={`whitespace-pre-wrap break-words ${KIND_STYLE[l.kind]}`}>
                        <span className="select-none opacity-60">{PREFIX[l.kind]}</span>
                        {l.kind === "sql" ? (
                            <span className="block pl-3 border-l-2 border-emerald-500/30">{l.text}</span>
                        ) : l.href ? (
                            <>{l.text}{" "}<Link href={l.href} className="text-sky-400 underline">Ver reporte →</Link></>
                        ) : (l.text)}
                    </div>
                ))}
                {active.busy && <ThinkingIndicator label={[...active.lines].reverse().find((l) => l.kind === "phase")?.text} />}
            </div>

            {active.savedUrl && (
                <div className="px-4 py-2 border-t border-emerald-500/20 bg-emerald-500/5 shrink-0">
                    <Link href={active.savedUrl} className="text-emerald-300 hover:text-emerald-200">★ Ver el reporte →</Link>
                </div>
            )}

            {/* Input */}
            <div className="border-t border-white/10 bg-[#0d1320] px-4 py-3 shrink-0">
                {active.suggestions.length > 0 && !active.busy && (
                    <div className="flex flex-wrap gap-2 mb-2.5">
                        <span className="text-[11px] text-slate-500 self-center select-none">Sugerencias:</span>
                        {active.suggestions.map((s, i) => (
                            <button key={i} onClick={() => handleSend(s)} className="px-3 py-1.5 rounded-full text-[12px] bg-white/5 border border-white/15 text-sky-200 hover:bg-sky-500/15 hover:border-sky-400/50 transition-colors">{s}</button>
                        ))}
                    </div>
                )}
                <div className="flex items-end gap-2">
                    <span className="text-emerald-400 pt-2 select-none">$</span>
                    <textarea
                        value={active.input}
                        onChange={(e) => updateSession(active.id, (s) => ({ ...s, input: e.target.value }))}
                        onKeyDown={onKeyDown}
                        disabled={active.busy}
                        rows={1}
                        placeholder='Ej: "Quiero ver mis ventas" (te preguntaré los detalles)'
                        className="flex-1 bg-transparent resize-none outline-none text-[#d6deeb] placeholder:text-slate-600 disabled:opacity-50 py-1.5"
                    />
                    <button onClick={() => handleSend()} disabled={active.busy || !active.input.trim()} className="px-4 py-1.5 rounded bg-emerald-500/90 hover:bg-emerald-400 text-[#0a0e14] font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Enviar</button>
                </div>
                <div className="flex items-center justify-between gap-3 mt-1.5 flex-wrap">
                    <p className="text-[11px] text-slate-600">Enter envía · Shift+Enter salto · pestañas persistentes · sin costo durante la charla</p>
                    <label className="flex items-center gap-2 text-[11px] text-slate-500">
                        Conversación:
                        <select
                            value={convModel}
                            onChange={(e) => { setConvModel(e.target.value); try { localStorage.setItem("advanced_conv_model", e.target.value); } catch { } }}
                            className="bg-[#0a0e14] border border-white/15 rounded px-2 py-1 text-[#d6deeb] outline-none focus:border-emerald-500/50 cursor-pointer"
                        >
                            {models.length === 0 && <option value="">(cargando…)</option>}
                            {models.map((m) => (<option key={m.id} value={m.id} className="bg-[#0d1320]">{m.label}</option>))}
                        </select>
                    </label>
                </div>
            </div>

            {/* Modal de armado (solo al CREAR un reporte nuevo) */}
            {active.proposal && !active.editingReportId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div className="w-full max-w-lg bg-[#0d1320] border border-white/15 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="px-5 py-4 border-b border-white/10">
                            <h3 className="text-indigo-300 font-bold tracking-wide">Crear reporte</h3>
                            <p className="text-slate-500 text-[12px] mt-1">{active.proposal.description || "Confirma cómo llamarlo y con qué modelo generarlo."}</p>
                        </div>
                        <div className="p-5 space-y-4 overflow-auto">
                            {/* Resumen del reporte a crear */}
                            <div className="bg-white/5 rounded-lg p-3 space-y-1.5">
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider">Resumen del reporte</div>
                                {Array.isArray(active.proposal.blocks) && active.proposal.blocks.length > 0 ? (
                                    <>
                                        <div className="text-[13px] text-[#d6deeb]">
                                            Tablero: <b className="text-indigo-300">{active.proposal.blocks.length} bloque(s)</b>
                                        </div>
                                        <div className="text-[12px] text-slate-400">
                                            {active.proposal.blocks.map((b: any, i: number) => {
                                                const label = b?.type === "kpis" ? "KPIs"
                                                    : b?.type === "table" ? "Tabla"
                                                        : b?.type === "narrative" ? "Nota"
                                                            : (VIZ_LABELS[b?.visualization || "bar"] || b?.visualization || "Gráfica");
                                                return `${b?.title || `Bloque ${i + 1}`} (${label})`;
                                            }).join(" · ")}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="text-[13px] text-[#d6deeb]">
                                            Gráfica: <b className="text-indigo-300">{VIZ_LABELS[active.proposal.visualization || "table"] || active.proposal.visualization}</b>
                                        </div>
                                        {Array.isArray(active.proposal.expectedColumns) && active.proposal.expectedColumns.length > 0 && (
                                            <div className="text-[12px] text-slate-400">Columnas: {active.proposal.expectedColumns.map((c: any) => c.label || c.key).join(", ")}</div>
                                        )}
                                    </>
                                )}
                                <div className="text-[12px] text-slate-400">
                                    Filtros: {Array.isArray(active.proposal.params) && active.proposal.params.length
                                        ? active.proposal.params.map((p: any) => `${p.label} (${PARAM_KIND_LABELS[p.kind] || p.kind})`).join(" · ")
                                        : "ninguno"}
                                </div>
                                {Array.isArray(active.proposal.insights) && active.proposal.insights.length > 0 && (
                                    <div className="text-[12px] text-slate-400">Incluye {active.proposal.insights.length} hallazgo(s) y {active.proposal.recommendations?.length || 0} recomendación(es).</div>
                                )}
                            </div>

                            <label className="block">
                                <span className="text-[11px] text-slate-500 uppercase tracking-wider">Nombre del reporte</span>
                                <input value={buildName} onChange={(e) => setBuildName(e.target.value)} placeholder={active.proposal.title || "Nombre"}
                                    className="mt-1 w-full bg-[#0a0e14] border border-white/15 rounded-lg px-3 py-2 text-[#d6deeb] outline-none focus:border-indigo-400" />
                            </label>
                            <label className="block">
                                <span className="text-[11px] text-slate-500 uppercase tracking-wider">Modelo a usar</span>
                                <select value={buildModel} onChange={(e) => setBuildModel(e.target.value)}
                                    className="mt-1 w-full bg-[#0a0e14] border border-white/15 rounded-lg px-3 py-2 text-[#d6deeb] outline-none focus:border-indigo-400 cursor-pointer">
                                    {models.length === 0 && <option value="">(cargando…)</option>}
                                    {models.map((m) => (<option key={m.id} value={m.id} className="bg-[#0d1320]">{m.label}</option>))}
                                </select>
                            </label>
                            {active.proposal.complexity && (
                                <p className="text-[11px] text-indigo-300/80">
                                    Recomendado por complejidad <b>{active.proposal.complexity}</b>: {models.find((m) => m.id === active.proposal?.recommendedModel)?.label || active.proposal.recommendedModel}
                                </p>
                            )}
                            <div className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-3">
                                <span className="text-[11px] text-slate-500 uppercase tracking-wider">Costo estimado</span>
                                <span className="text-emerald-300 font-bold">{fmtUsd(estUsd)} · {fmtMxn(estMxn)} MXN</span>
                            </div>

                            {/* Agregar más parámetros / filtros (re-propone con el agente) */}
                            <div className="border-t border-white/10 pt-3 space-y-2">
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider">¿Agregar más filtros o parámetros?</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {QUICK_PARAMS.map((q) => (
                                        <button key={q} onClick={() => refineProposal(q)} disabled={building}
                                            className="px-2.5 py-1 rounded-full text-[11px] bg-white/5 border border-white/15 text-sky-200 hover:bg-sky-500/15 hover:border-sky-400/50 disabled:opacity-50 transition-colors">
                                            + {q}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        value={refineText}
                                        onChange={(e) => setRefineText(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); refineProposal(refineText); } }}
                                        placeholder="Otro ajuste… (ej. solo una sucursal, agrupar por semana)"
                                        className="flex-1 bg-[#0a0e14] border border-white/15 rounded-lg px-3 py-2 text-[#d6deeb] outline-none focus:border-indigo-400 text-[13px] placeholder:text-slate-600"
                                    />
                                    <button onClick={() => refineProposal(refineText)} disabled={building || !refineText.trim()}
                                        className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 text-sm disabled:opacity-50 transition-colors">
                                        Ajustar
                                    </button>
                                </div>
                                <p className="text-[10px] text-slate-600">Ajustar reabre la conversación para rehacer la propuesta con el cambio (sin costo).</p>
                            </div>

                            {buildError && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-3 text-sm">{buildError}</div>}
                        </div>
                        <div className="px-5 py-4 flex justify-end gap-2 border-t border-white/10 flex-wrap">
                            <button onClick={() => updateSession(active.id, (s) => ({ ...s, proposal: null }))} disabled={building} className="px-4 py-2 rounded text-slate-300 hover:bg-white/5 transition-colors disabled:opacity-50">Cancelar</button>
                            <button onClick={() => buildReport()} disabled={building || !buildName.trim()} className="px-4 py-2 rounded bg-indigo-500 hover:bg-indigo-400 text-white font-bold transition-colors disabled:opacity-50">{building ? "Creando…" : "Crear reporte"}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
