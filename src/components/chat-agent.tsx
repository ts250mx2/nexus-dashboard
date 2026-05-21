'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChatInput } from '@/components/chat-input';
import { AgentDataView } from '@/components/agent-data-view';
import { InlineMarkdown } from '@/components/inline-markdown';
import { ConversationsDropdown } from '@/components/conversations-dropdown';
import { readSseStream } from '@/lib/sse-client';
import { cn } from '@/lib/utils';
import {
    X,
    Maximize2,
    Trash2,
    Lightbulb,
    Target,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    AlertCircle,
    TrendingUp,
    Sparkles,
    RefreshCw,
    BarChart3,
    ThumbsUp,
    ThumbsDown,
    Brain,
    LineChart,
    Zap
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

interface Message {
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    sql?: string;
    visualization?: string;
    results?: Record<string, any>[];
    suggestedQuestions?: string[];
    timestamp?: number;
    error?: string;
    ai_model?: string;
    conversational?: boolean;
    key_insights?: string[];
    recommendations?: string[];
    suggested_reports?: Array<{
        report_name: string;
        reason: string;
        expected_action?: string;
        path?: string;
    }>;
    follow_up?: { question: string; rationale?: string; sql?: string | null } | null;
    causal?: { hypotheses_count: number; strong_count: number } | null;
    forecast?: {
        forecast: Array<{ date: string; pointEstimate: number; lowerBound: number; upperBound: number }>;
        confidence: 'high' | 'medium' | 'low';
        r2: number;
        summary: string;
    } | null;
    streaming?: boolean;
    streamPhase?: 'thinking' | 'querying' | 'correcting-sql' | 'investigating' | 'reasoning-causal' | 'analyzing' | 'finalizing';
    streamPhaseDetail?: string;
    feedback?: 'up' | 'down' | null;
}

const STREAM_PHASE_LABELS: Record<NonNullable<Message['streamPhase']>, string> = {
    'thinking': 'Pensando...',
    'querying': 'Consultando datos...',
    'correcting-sql': 'Ajustando consulta...',
    'investigating': 'Investigando causa...',
    'reasoning-causal': 'Razonando causalmente...',
    'analyzing': 'Analizando resultados...',
    'finalizing': 'Preparando análisis...'
};

interface ProactivePrompt {
    id: string;
    message: string;
    context: string | null;
    suggestedAction: string;
    severity: 'critical' | 'opportunity' | 'info';
}

interface DailyInsight {
    id: string;
    question: string;
    severity: 'critical' | 'opportunity' | 'info';
    area: string;
    summary: string;
}

const SEVERITY_STYLES: Record<DailyInsight['severity'], { bar: string; dot: string; icon: any; label: string }> = {
    critical: { bar: 'bg-rose-500', dot: 'bg-rose-500', icon: AlertCircle, label: 'Crítico' },
    opportunity: { bar: 'bg-emerald-500', dot: 'bg-emerald-500', icon: TrendingUp, label: 'Oportunidad' },
    info: { bar: 'bg-blue-400', dot: 'bg-blue-400', icon: Sparkles, label: 'Insight' }
};

const PAGE_SUGGESTIONS: Record<string, string[]> = {
    '/dashboard': [
        '¿Cuáles fueron las ventas totales de hoy?',
        '¿Qué sucursal tiene más ventas este mes?',
        'Muéstrame el top 5 de productos más vendidos',
        'Ventas de hoy comparadas con ayer',
        'Resumen de ventas por departamento'
    ],
    '/dashboard/reportes/ventas': [
        'Analizar ventas del mes actual',
        '¿Cuál es el ticket promedio general?',
        'Ver distribución de ventas por sucursal',
        'Top 10 productos más vendidos',
        'Ventas por día de la semana'
    ],
    '/dashboard/reportes/margen': [
        '¿Qué sucursal tiene el mejor margen este mes?',
        'Productos con margen negativo este mes',
        'Departamento con mayor utilidad bruta',
        'Margen promedio vs mes anterior',
        '¿Qué marca deja más utilidad?'
    ],
    '/dashboard/reportes/profesores': [
        'Profesores con más ventas este mes',
        'Comisiones totales del mes',
        'Compara desempeño de profesores entre sucursales',
        'Top 10 profesores por venta',
        'Ventas por profesor en los últimos 30 días'
    ]
};

const DEFAULT_FALLBACK = [
    '¿Cómo van las ventas hoy?',
    'Top 5 productos más vendidos',
    'Ventas por sucursal',
    'Ticket promedio del día',
    'Ventas de este mes'
];

interface ChatAgentProps {
    mode?: 'floating' | 'embedded';
}

export function ChatAgent({ mode = 'floating' }: ChatAgentProps = {}) {
    const pathname = usePathname();
    const router = useRouter();
    const isEmbedded = mode === 'embedded';
    const [isOpen, setIsOpen] = useState(isEmbedded);
    const [messages, setMessages] = useState<Message[]>([]);
    const [defaultSuggestions, setDefaultSuggestions] = useState<string[]>([]);
    const [dailyInsights, setDailyInsights] = useState<DailyInsight[]>([]);
    const [briefing, setBriefing] = useState<string>('');
    const [loadingInsights, setLoadingInsights] = useState(false);
    const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [expandedInsights, setExpandedInsights] = useState<Record<number, boolean>>({});
    const [expandedRecommendations, setExpandedRecommendations] = useState<Record<number, boolean>>({});
    const [expandedData, setExpandedData] = useState<Record<number, boolean>>({});
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [conversationsRefreshKey, setConversationsRefreshKey] = useState(0);
    const [proactivePrompts, setProactivePrompts] = useState<ProactivePrompt[]>([]);
    const [expandedForecast, setExpandedForecast] = useState<Record<number, boolean>>({});
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const streamControllerRef = useRef<AbortController | null>(null);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const generateConversationId = (): string => {
        return 'conv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    };

    const saveCurrentConversation = useCallback((msgs: Message[], idOverride?: string) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        const userMessages = msgs.filter(m => m.role === 'user');
        if (userMessages.length === 0) return;

        saveTimerRef.current = setTimeout(async () => {
            try {
                let convId = idOverride || activeConversationId;
                if (!convId) {
                    convId = generateConversationId();
                    setActiveConversationId(convId);
                }
                const r = await fetch('/api/agent/conversations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: convId, messages: msgs })
                });
                if (r.ok) setConversationsRefreshKey(k => k + 1);
            } catch (e) {
                console.error('Error guardando conversación:', e);
            }
        }, 800);
    }, [activeConversationId]);

    const loadConversation = useCallback(async (id: string) => {
        if (streamControllerRef.current) {
            streamControllerRef.current.abort();
            streamControllerRef.current = null;
        }
        try {
            const r = await fetch(`/api/agent/conversations/${id}`);
            const data = await r.json();
            if (data.conversation) {
                setMessages(data.conversation.messages || []);
                setActiveConversationId(id);
                setExpandedInsights({});
                setExpandedRecommendations({});
                setExpandedData({});
            }
        } catch (e) {
            console.error('Error cargando conversación:', e);
        }
    }, []);

    const startNewConversation = useCallback(() => {
        if (streamControllerRef.current) {
            streamControllerRef.current.abort();
            streamControllerRef.current = null;
        }
        setMessages([]);
        setActiveConversationId(null);
        setExpandedInsights({});
        setExpandedRecommendations({});
        setExpandedData({});
        localStorage.removeItem('nexus_chat_history');
    }, []);

    const fetchDailyInsights = useCallback(async (forceRefresh = false) => {
        const todayKey = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
        const cacheKey = 'nexus_daily_insights';
        const briefingKey = 'nexus_daily_briefing';
        const cacheDateKey = 'nexus_daily_insights_date';

        const cachedDate = localStorage.getItem(cacheDateKey);
        if (cachedDate !== todayKey) {
            localStorage.removeItem(cacheKey);
            localStorage.removeItem(briefingKey);
            localStorage.setItem(cacheDateKey, todayKey);
        } else if (!forceRefresh) {
            const cached = localStorage.getItem(cacheKey);
            const cachedBriefing = localStorage.getItem(briefingKey);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        setDailyInsights(parsed);
                        if (cachedBriefing) setBriefing(cachedBriefing);
                        return;
                    }
                } catch { }
            }
        }

        setLoadingInsights(true);
        try {
            const url = forceRefresh ? '/api/agent/daily-insights?refresh=true' : '/api/agent/daily-insights';
            const response = await fetch(url);
            const data = await response.json();
            if (Array.isArray(data.insights)) {
                setDailyInsights(data.insights);
                localStorage.setItem(cacheKey, JSON.stringify(data.insights));
                localStorage.setItem(cacheDateKey, todayKey);
            }
            if (data.briefing) {
                setBriefing(data.briefing);
                localStorage.setItem(briefingKey, data.briefing);
            }
        } catch (e) {
            console.error('Error cargando hallazgos diarios:', e);
        } finally {
            setLoadingInsights(false);
        }
    }, []);

    const generateMessageId = (): string => {
        return 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    };

    const fetchProactivePrompts = useCallback(async () => {
        try {
            const r = await fetch('/api/agent/proactive-prompts');
            if (!r.ok) return;
            const data = await r.json();
            if (Array.isArray(data.prompts)) {
                setProactivePrompts(data.prompts);
            }
        } catch (e) {
            console.error('Error cargando prompts proactivos:', e);
        }
    }, []);

    const resolveProactivePrompt = useCallback(async (id: string, status: 'accepted' | 'dismissed') => {
        setProactivePrompts(prev => prev.filter(p => p.id !== id));
        try {
            await fetch('/api/agent/proactive-prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'resolve', id, status })
            });
        } catch (e) {
            console.error('Error resolviendo prompt proactivo:', e);
        }
    }, []);

    const sendFeedback = useCallback(async (msgIndex: number, rating: 'up' | 'down') => {
        setMessages(prev => {
            if (msgIndex < 0 || msgIndex >= prev.length) return prev;
            const copy = [...prev];
            copy[msgIndex] = { ...copy[msgIndex], feedback: rating };
            return copy;
        });
        try {
            const msg = messages[msgIndex];
            if (!msg) return;
            const messageId = msg.id || `msg_${msg.timestamp || Date.now()}`;
            const userMsg = msgIndex > 0 ? messages[msgIndex - 1] : null;
            await fetch('/api/agent/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messageId,
                    conversationId: activeConversationId,
                    rating,
                    prompt: userMsg?.role === 'user' ? userMsg.content : null,
                    response: msg.content || null,
                    sql: msg.sql || null,
                    aiModel: msg.ai_model || null
                })
            });
        } catch (e) {
            console.error('Error enviando feedback:', e);
        }
    }, [messages, activeConversationId]);

    const toggleForecast = (index: number) => {
        setExpandedForecast(prev => ({ ...prev, [index]: !prev[index] }));
    };

    const toggleData = (index: number) => {
        setExpandedData(prev => ({ ...prev, [index]: !prev[index] }));
    };

    const toggleInsights = (index: number) => {
        setExpandedInsights(prev => ({ ...prev, [index]: !prev[index] }));
    };

    const toggleRecommendations = (index: number) => {
        setExpandedRecommendations(prev => ({ ...prev, [index]: !prev[index] }));
    };

    const navigateToReport = (path?: string) => {
        if (path) {
            router.push(path);
            if (!isEmbedded) setIsOpen(false);
        }
    };

    const loadDefaultSuggestions = useCallback(async () => {
        const suggestions = PAGE_SUGGESTIONS[pathname] || DEFAULT_FALLBACK;
        setDefaultSuggestions(suggestions);
    }, [pathname]);

    useEffect(() => {
        if (messages.length === 0) {
            loadDefaultSuggestions();
        }
    }, [messages.length, loadDefaultSuggestions]);

    useEffect(() => {
        if (isOpen && dailyInsights.length === 0 && !loadingInsights) {
            fetchDailyInsights(false);
        }
    }, [isOpen, dailyInsights.length, loadingInsights, fetchDailyInsights]);

    useEffect(() => {
        if (isOpen) {
            fetchProactivePrompts();
        }
    }, [isOpen, fetchProactivePrompts]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        const savedMessages = localStorage.getItem('nexus_chat_history');
        if (savedMessages) {
            try {
                const parsed = JSON.parse(savedMessages);
                const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
                const filtered = parsed.filter((msg: Message) => !msg.timestamp || msg.timestamp > oneDayAgo);
                setMessages(filtered);
            } catch {
                setMessages([]);
            }
        }
        setIsHistoryLoaded(true);
    }, []);

    useEffect(() => {
        if (isHistoryLoaded) {
            localStorage.setItem('nexus_chat_history', JSON.stringify(messages));
            const lastMsg = messages[messages.length - 1];
            const hasPendingStream = lastMsg?.streaming;
            if (messages.length > 0 && !hasPendingStream) {
                saveCurrentConversation(messages);
            }
        }
        scrollToBottom();
    }, [messages, isHistoryLoaded, saveCurrentConversation]);

    const handleSend = async (prompt: string) => {
        if (!prompt.trim()) return;

        let finalPrompt = prompt;
        const lowerPrompt = prompt.toLowerCase();
        const isRefinement = lowerPrompt.startsWith('por ') ||
            lowerPrompt.startsWith('de ') ||
            lowerPrompt.startsWith('en ') ||
            lowerPrompt.startsWith('este ') ||
            lowerPrompt.startsWith('esta ');

        if (isRefinement) {
            const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
            if (lastUserMsg) {
                const cleanLast = lastUserMsg.content.replace(/\?$/, '');
                finalPrompt = `${cleanLast} ${prompt}`;
            }
        }

        const userMsg: Message = { role: 'user', content: finalPrompt, timestamp: Date.now() };
        setMessages((prev) => [...prev, userMsg]);
        setLoading(true);

        const selectedModel = typeof window !== 'undefined'
            ? localStorage.getItem('ai_query_model') || 'claude-opus-4-7'
            : 'claude-opus-4-7';
        const useStreaming = selectedModel.includes('claude');

        if (streamControllerRef.current) {
            streamControllerRef.current.abort();
        }
        const controller = new AbortController();
        streamControllerRef.current = controller;

        const assistantTimestamp = Date.now();
        let assistantIndex = -1;
        setMessages((prev) => {
            assistantIndex = prev.length;
            return [...prev, {
                id: generateMessageId(),
                role: 'assistant',
                content: '',
                timestamp: assistantTimestamp,
                streaming: useStreaming,
                streamPhase: useStreaming ? 'thinking' : undefined,
                ai_model: selectedModel
            }];
        });

        const updateAssistant = (patch: Partial<Message> | ((msg: Message) => Partial<Message>)) => {
            setMessages((prev) => {
                if (assistantIndex < 0 || assistantIndex >= prev.length) return prev;
                const copy = [...prev];
                const current = copy[assistantIndex];
                const updates = typeof patch === 'function' ? patch(current) : patch;
                copy[assistantIndex] = { ...current, ...updates };
                return copy;
            });
        };

        try {
            const history = messages
                .filter(m => m.content && m.content.trim())
                .slice(-12)
                .map(m => ({ role: m.role, content: m.content }));

            const endpoint = useStreaming ? '/api/query?stream=true' : '/api/query';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: finalPrompt, model: selectedModel, history }),
                signal: controller.signal
            });

            const isActuallyStreaming = useStreaming && response.headers.get('content-type')?.includes('text/event-stream');

            if (!response.ok && !isActuallyStreaming) {
                const data = await response.json().catch(() => ({}));
                let errorContent = `Error: ${data.error || 'No se pudo procesar la solicitud'}`;
                if (data.sql) errorContent += `\n\nConsulta SQL fallida:\n${data.sql}`;
                updateAssistant({ content: errorContent, streaming: false, streamPhase: undefined });
                return;
            }

            if (isActuallyStreaming) {
                let accumulatedText = '';
                let firstChunkReceived = false;

                for await (const evt of readSseStream(response, controller.signal)) {
                    switch (evt.event) {
                        case 'status': {
                            const phase = evt.data?.phase as Message['streamPhase'];
                            const detail = evt.data?.detail as string | undefined;
                            if (phase) updateAssistant({ streamPhase: phase, streamPhaseDetail: detail });
                            break;
                        }
                        case 'text-delta': {
                            const chunk = evt.data?.text || '';
                            if (!firstChunkReceived) {
                                firstChunkReceived = true;
                                updateAssistant({ streamPhase: undefined });
                            }
                            accumulatedText += chunk;
                            updateAssistant({ content: accumulatedText });
                            break;
                        }
                        case 'clarification': {
                            updateAssistant({
                                content: evt.data?.message || '',
                                suggestedQuestions: evt.data?.suggested_questions || [],
                                ai_model: evt.data?.ai_model,
                                streaming: false,
                                streamPhase: undefined
                            });
                            break;
                        }
                        case 'metadata': {
                            updateAssistant({
                                sql: evt.data?.sql,
                                results: evt.data?.data,
                                visualization: evt.data?.visualization,
                                suggestedQuestions: evt.data?.suggested_questions || [],
                                key_insights: evt.data?.key_insights || [],
                                recommendations: evt.data?.recommendations || [],
                                suggested_reports: evt.data?.suggested_reports,
                                follow_up: evt.data?.follow_up || null,
                                causal: evt.data?.causal || null,
                                forecast: evt.data?.forecast || null,
                                conversational: evt.data?.conversational === true,
                                ai_model: evt.data?.ai_model
                            });
                            break;
                        }
                        case 'error': {
                            updateAssistant({
                                content: accumulatedText
                                    ? `${accumulatedText}\n\n*(Error: ${evt.data?.message || 'fallo en el análisis'})*`
                                    : `Error: ${evt.data?.message || 'No se pudo procesar la solicitud'}`,
                                streaming: false,
                                streamPhase: undefined
                            });
                            break;
                        }
                        case 'done': {
                            updateAssistant({ streaming: false, streamPhase: undefined });
                            break;
                        }
                    }
                }
            } else {
                const data = await response.json();
                updateAssistant({
                    content: data.message || 'He procesado tu consulta.',
                    sql: data.sql,
                    visualization: data.visualization,
                    results: data.data,
                    suggestedQuestions: data.suggested_questions,
                    ai_model: data.ai_model,
                    conversational: data.conversational === true,
                    key_insights: data.key_insights,
                    recommendations: data.recommendations,
                    suggested_reports: data.suggested_reports,
                    follow_up: data.follow_up || null,
                    causal: data.causal || null,
                    forecast: data.forecast || null,
                    streaming: false,
                    streamPhase: undefined
                });
            }
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                updateAssistant({ streaming: false, streamPhase: undefined });
            } else {
                updateAssistant({
                    content: `Error de conexión: ${err?.message || 'desconocido'}`,
                    streaming: false,
                    streamPhase: undefined
                });
            }
        } finally {
            setLoading(false);
            if (streamControllerRef.current === controller) {
                streamControllerRef.current = null;
            }
        }
    };

    const handleClear = () => {
        startNewConversation();
        loadDefaultSuggestions();
    };

    return (
        <div
            className={cn(
                isEmbedded
                    ? 'relative w-full h-full flex flex-col'
                    : 'fixed z-[9999] flex flex-col items-end bottom-6 right-6'
            )}
        >
            {!isEmbedded && !isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="group relative flex items-center justify-center w-16 h-16 bg-white border border-slate-200 text-blue-600 rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 animate-in zoom-in"
                >
                    <div className="absolute inset-0 bg-blue-600 rounded-full animate-ping opacity-10 pointer-events-none" />
                    <img src="/nexus-ai-logo.png" alt="Nexus AI" className="w-10 h-10 group-hover:rotate-12 transition-transform" />
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full" />
                </button>
            )}

            {isOpen && (
                <div className={cn(
                    'bg-slate-50 flex flex-col overflow-hidden',
                    isEmbedded
                        ? 'w-full h-full'
                        : 'border border-slate-200 shadow-2xl mb-4 transition-all duration-300 ease-in-out w-[380px] md:w-[850px] h-[500px] md:h-[85vh] rounded-[32px]'
                )}>
                    {/* Header */}
                    <div className="p-5 bg-white border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <div className="w-12 h-12 bg-white border border-slate-100 rounded-2xl shadow-sm flex items-center justify-center overflow-hidden">
                                <img src="/nexus-ai-logo.png" alt="Nexus AI" className="w-8 h-8 pointer-events-none select-none" />
                            </div>
                            <div>
                                <h3 className="font-black text-slate-900 tracking-tight leading-none uppercase text-xs">Agente Nexus IA</h3>
                                <div className="flex items-center space-x-1.5 mt-1">
                                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">En línea (Claude Opus 4.7)</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center space-x-1">
                            <ConversationsDropdown
                                activeId={activeConversationId}
                                onSelect={loadConversation}
                                onNew={startNewConversation}
                                refreshKey={conversationsRefreshKey}
                            />
                            <button onClick={handleClear} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400" title="Nueva conversación">
                                <Trash2 className="w-5 h-5" />
                            </button>
                            {!isEmbedded && (
                                <>
                                    <button
                                        onClick={() => {
                                            setIsOpen(false);
                                            router.push('/dashboard/reports/ai-agent');
                                        }}
                                        className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                                        title="Abrir en pantalla completa"
                                    >
                                        <Maximize2 className="w-5 h-5" />
                                    </button>
                                    <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400">
                                        <X className="w-6 h-6" />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scroll-smooth" id="chat-messages">
                        {/* Prompts proactivos (siempre visibles cuando hay) */}
                        {proactivePrompts.length > 0 && messages.length === 0 && (
                            <div className="space-y-2 mb-2 animate-in fade-in slide-in-from-top-4 duration-500">
                                <div className="flex items-center gap-2 px-2">
                                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">
                                        El agente detectó algo
                                    </span>
                                </div>
                                {proactivePrompts.slice(0, 3).map((pp) => {
                                    const sevBar = pp.severity === 'critical' ? 'bg-rose-500'
                                        : pp.severity === 'opportunity' ? 'bg-emerald-500'
                                            : 'bg-amber-400';
                                    return (
                                        <div
                                            key={pp.id}
                                            className="relative bg-gradient-to-br from-amber-50 to-white border border-amber-200 rounded-2xl p-4 shadow-sm"
                                        >
                                            <div className={cn('absolute left-0 top-3 bottom-3 w-1 rounded-full', sevBar)} />
                                            <div className="pl-2 space-y-2">
                                                <p className="text-sm font-bold text-slate-800 leading-snug">{pp.message}</p>
                                                {pp.context && (
                                                    <p className="text-[11px] text-slate-600 leading-snug">{pp.context}</p>
                                                )}
                                                <div className="flex gap-2 pt-1">
                                                    <button
                                                        onClick={() => {
                                                            resolveProactivePrompt(pp.id, 'accepted');
                                                            handleSend(pp.suggestedAction);
                                                        }}
                                                        className="flex-1 px-3 py-1.5 bg-slate-900 hover:bg-blue-600 text-white rounded-full text-[11px] font-bold transition-colors active:scale-95"
                                                    >
                                                        Investigar
                                                    </button>
                                                    <button
                                                        onClick={() => resolveProactivePrompt(pp.id, 'dismissed')}
                                                        className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 rounded-full text-[11px] font-bold transition-colors active:scale-95"
                                                    >
                                                        Descartar
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {messages.length === 0 && (
                            <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-700">
                                {/* Briefing */}
                                {briefing ? (
                                    <div className="bg-white rounded-[28px] border border-slate-100 shadow-sm overflow-hidden mb-6">
                                        <div className="px-6 pt-5 pb-2 flex items-center gap-2">
                                            <Sparkles className="w-4 h-4 text-blue-500" />
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Briefing del día</span>
                                            <span className="ml-auto text-[10px] text-slate-400 font-medium">
                                                {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}
                                            </span>
                                        </div>
                                        <div className="px-6 pb-6">
                                            <InlineMarkdown
                                                text={briefing}
                                                className="text-[15px] leading-relaxed text-slate-700 font-medium"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center text-center mb-6 py-6">
                                        <div className="p-6 bg-white rounded-[32px] shadow-sm border border-slate-100 mb-4">
                                            <img src="/nexus-ai-logo.png" alt="Nexus" className={cn('w-12 h-12 object-contain', loadingInsights && 'animate-pulse')} />
                                        </div>
                                        <h2 className="text-2xl font-black tracking-tight text-slate-900">
                                            {loadingInsights ? 'Preparando briefing...' : '¿Qué analizamos hoy?'}
                                        </h2>
                                        <p className="text-slate-500 max-w-sm font-medium mt-2 text-sm">
                                            {loadingInsights
                                                ? 'Analizando los datos del día para tu resumen ejecutivo'
                                                : 'Estoy listo para explorar tus datos de ventas, sucursales, margen y operación.'}
                                        </p>
                                    </div>
                                )}

                                {/* Hallazgos del día */}
                                {dailyInsights.length > 0 && (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between px-2">
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                                Hallazgos del día · {dailyInsights.length}
                                            </span>
                                            <button
                                                onClick={() => fetchDailyInsights(true)}
                                                disabled={loadingInsights}
                                                className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-blue-600 transition-colors disabled:opacity-50"
                                                title="Actualizar hallazgos"
                                            >
                                                <RefreshCw className={cn('w-3 h-3', loadingInsights && 'animate-spin')} />
                                                Actualizar
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2">
                                            {dailyInsights.slice(0, 6).map((insight, i) => {
                                                const sev = SEVERITY_STYLES[insight.severity] || SEVERITY_STYLES.info;
                                                const SevIcon = sev.icon;
                                                return (
                                                    <button
                                                        key={insight.id || i}
                                                        onClick={() => handleSend(insight.question)}
                                                        className="group relative flex items-start gap-3 p-4 text-left bg-white border border-slate-100 rounded-2xl hover:border-blue-300 hover:shadow-md transition-all animate-in fade-in slide-in-from-left-2 duration-300"
                                                        style={{ animationDelay: `${i * 50}ms` }}
                                                    >
                                                        <div className={cn('absolute left-0 top-3 bottom-3 w-1 rounded-full', sev.bar)} />
                                                        <div className="pl-2 flex items-start gap-3 flex-1 min-w-0">
                                                            <SevIcon className={cn(
                                                                'w-4 h-4 mt-0.5 flex-shrink-0',
                                                                insight.severity === 'critical' && 'text-rose-500',
                                                                insight.severity === 'opportunity' && 'text-emerald-500',
                                                                insight.severity === 'info' && 'text-blue-400'
                                                            )} />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-bold text-slate-800 group-hover:text-blue-700 leading-snug">
                                                                    {insight.question}
                                                                </p>
                                                                {insight.summary && (
                                                                    <p className="text-[11px] text-slate-500 mt-1 leading-snug line-clamp-2">
                                                                        {insight.summary}
                                                                    </p>
                                                                )}
                                                                <div className="flex items-center gap-2 mt-2">
                                                                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                                                        {insight.area}
                                                                    </span>
                                                                    <span className="text-[9px] text-slate-300">·</span>
                                                                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                                                        {sev.label}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Default suggestions si no hay insights */}
                                {dailyInsights.length === 0 && !loadingInsights && defaultSuggestions.length > 0 && (
                                    <div className="space-y-3">
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-2">
                                            Para empezar
                                        </span>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {defaultSuggestions.slice(0, 6).map((s, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => handleSend(s)}
                                                    className="p-4 text-left bg-white border border-slate-100 rounded-2xl hover:border-blue-300 hover:shadow-md transition-all"
                                                >
                                                    <p className="text-sm font-bold text-slate-700 leading-snug">{s}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {messages.map((message, index) => (
                            <div key={index} className={cn('flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 group', message.role === 'user' ? 'items-end' : 'items-start')}>
                                <div className={cn(
                                    'max-w-[90%] rounded-[32px] overflow-hidden shadow-sm',
                                    message.role === 'user'
                                        ? 'bg-slate-900 text-white rounded-tr-none px-6 py-4'
                                        : 'bg-white border border-slate-200 rounded-tl-none w-full md:w-auto'
                                )}>
                                    {message.role === 'assistant' ? (
                                        <div className="flex flex-col">
                                            <div className="px-6 py-5">
                                                {/* Indicador de fase streaming */}
                                                {message.streaming && message.streamPhase && !message.content && (
                                                    <div className="flex flex-col gap-1 animate-in fade-in duration-200">
                                                        <div className="flex items-center gap-2 text-slate-500">
                                                            <div className="flex space-x-1">
                                                                <div className={cn(
                                                                    'w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.3s]',
                                                                    message.streamPhase === 'investigating' ? 'bg-amber-500'
                                                                        : message.streamPhase === 'reasoning-causal' ? 'bg-purple-500'
                                                                        : 'bg-blue-500'
                                                                )} />
                                                                <div className={cn(
                                                                    'w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.15s]',
                                                                    message.streamPhase === 'investigating' ? 'bg-amber-500'
                                                                        : message.streamPhase === 'reasoning-causal' ? 'bg-purple-500'
                                                                        : 'bg-blue-500'
                                                                )} />
                                                                <div className={cn(
                                                                    'w-1.5 h-1.5 rounded-full animate-bounce',
                                                                    message.streamPhase === 'investigating' ? 'bg-amber-500'
                                                                        : message.streamPhase === 'reasoning-causal' ? 'bg-purple-500'
                                                                        : 'bg-blue-500'
                                                                )} />
                                                            </div>
                                                            <span className={cn(
                                                                'text-[11px] font-bold uppercase tracking-[0.15em]',
                                                                message.streamPhase === 'investigating' ? 'text-amber-600'
                                                                    : message.streamPhase === 'reasoning-causal' ? 'text-purple-600'
                                                                    : 'text-slate-400'
                                                            )}>
                                                                {STREAM_PHASE_LABELS[message.streamPhase]}
                                                            </span>
                                                        </div>
                                                        {message.streamPhaseDetail && (
                                                            <p className="text-[12px] text-slate-500 italic pl-5 mt-1 leading-snug">
                                                                {message.streamPhaseDetail}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Modelo */}
                                                {message.ai_model && (
                                                    <div className="flex items-center justify-end mb-2">
                                                        <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                                            <Sparkles className="w-2.5 h-2.5 text-blue-400" />
                                                            {message.ai_model}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Texto principal con markdown inline */}
                                                {message.content && (
                                                    <div className="relative">
                                                        <InlineMarkdown
                                                            text={message.content}
                                                            className="text-[15px] leading-relaxed text-slate-700"
                                                            onCite={
                                                                message.results && message.results.length > 0
                                                                    ? () => {
                                                                        setExpandedData(prev => ({ ...prev, [index]: true }));
                                                                        setTimeout(() => {
                                                                            const el = document.getElementById(`agent-data-${index}`);
                                                                            el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                                                        }, 100);
                                                                    }
                                                                    : undefined
                                                            }
                                                        />
                                                        {message.streaming && (
                                                            <span className="inline-block w-1.5 h-4 ml-0.5 bg-blue-500 align-middle animate-pulse" />
                                                        )}
                                                    </div>
                                                )}

                                                {/* Badges: causal / forecast */}
                                                {!message.conversational && (message.causal || message.forecast) && (
                                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                                        {message.causal && message.causal.hypotheses_count > 0 && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                                                                <Brain className="w-3 h-3" />
                                                                {message.causal.hypotheses_count} hipótesis
                                                                {message.causal.strong_count > 0 && ` · ${message.causal.strong_count} fuertes`}
                                                            </span>
                                                        )}
                                                        {message.follow_up && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-50 text-amber-700 border border-amber-200" title={message.follow_up.rationale || ''}>
                                                                <AlertCircle className="w-3 h-3" />
                                                                Investigación: {message.follow_up.question.slice(0, 50)}
                                                            </span>
                                                        )}
                                                        {message.forecast && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                                                                <LineChart className="w-3 h-3" />
                                                                Proyección {message.forecast.forecast.length}d · {message.forecast.confidence}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Chips: Ver datos / Hallazgos / Acciones / Proyección */}
                                                {!message.conversational && (
                                                    ((message.results && message.results.length > 0) ||
                                                        (message.key_insights && message.key_insights.length > 0) ||
                                                        (message.recommendations && message.recommendations.length > 0) ||
                                                        message.forecast) && (
                                                        <div className="mt-5 flex flex-wrap gap-2">
                                                            {message.results && message.results.length > 0 && !(message.results.length === 1 && Object.keys(message.results[0]).length === 1) && (
                                                                <button
                                                                    onClick={() => toggleData(index)}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-full transition-all border bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 active:scale-95"
                                                                >
                                                                    <BarChart3 className="w-3.5 h-3.5 text-slate-500" />
                                                                    <span>{expandedData[index] ? 'Ocultar datos' : 'Ver datos'}</span>
                                                                    {expandedData[index] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                                </button>
                                                            )}
                                                            {message.forecast && (
                                                                <button
                                                                    onClick={() => toggleForecast(index)}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-full transition-all border bg-white border-blue-200 text-blue-700 hover:bg-blue-50 active:scale-95"
                                                                >
                                                                    <LineChart className="w-3.5 h-3.5" />
                                                                    <span>Proyección</span>
                                                                    {expandedForecast[index] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                                </button>
                                                            )}
                                                            {message.key_insights && message.key_insights.length > 0 && (
                                                                <button
                                                                    onClick={() => toggleInsights(index)}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-full transition-all border bg-white border-blue-200 text-blue-700 hover:bg-blue-50 active:scale-95"
                                                                >
                                                                    <Lightbulb className="w-3.5 h-3.5" />
                                                                    <span>Hallazgos</span>
                                                                    <span className="ml-0.5 px-1.5 bg-blue-100 rounded-full text-[9px]">
                                                                        {message.key_insights.length}
                                                                    </span>
                                                                    {expandedInsights[index] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                                </button>
                                                            )}
                                                            {message.recommendations && message.recommendations.length > 0 && (
                                                                <button
                                                                    onClick={() => toggleRecommendations(index)}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-full transition-all border bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50 active:scale-95"
                                                                >
                                                                    <Target className="w-3.5 h-3.5" />
                                                                    <span>Acciones</span>
                                                                    <span className="ml-0.5 px-1.5 bg-emerald-100 rounded-full text-[9px]">
                                                                        {message.recommendations.length}
                                                                    </span>
                                                                    {expandedRecommendations[index] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                                </button>
                                                            )}
                                                        </div>
                                                    )
                                                )}

                                                {/* Datos: tabla/gráfica auto */}
                                                {expandedData[index] && message.results && message.results.length > 0 && (
                                                    <div
                                                        id={`agent-data-${index}`}
                                                        className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300 scroll-mt-4"
                                                    >
                                                        <AgentDataView
                                                            data={message.results}
                                                            suggestedViz={message.visualization as any}
                                                            question={messages[index - 1]?.content || ''}
                                                        />
                                                    </div>
                                                )}

                                                {/* Hallazgos */}
                                                {expandedInsights[index] && message.key_insights && message.key_insights.length > 0 && (
                                                    <div className="mt-4 relative bg-blue-50/50 border border-blue-100 p-4 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-300">
                                                        <div className="absolute left-0 top-3 bottom-3 w-1 bg-blue-500 rounded-full" />
                                                        <ul className="space-y-2 pl-2">
                                                            {message.key_insights.map((insight, idx) => (
                                                                <li key={idx} className="text-[13px] text-slate-700 leading-snug flex items-start">
                                                                    <span className="inline-block w-1 h-1 bg-blue-500 rounded-full mr-2.5 mt-2 flex-shrink-0" />
                                                                    <InlineMarkdown text={insight} className="flex-1" />
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {/* Acciones recomendadas */}
                                                {expandedRecommendations[index] && message.recommendations && message.recommendations.length > 0 && (
                                                    <div className="mt-4 relative bg-emerald-50/50 border border-emerald-100 p-4 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-300">
                                                        <div className="absolute left-0 top-3 bottom-3 w-1 bg-emerald-500 rounded-full" />
                                                        <ul className="space-y-2 pl-2">
                                                            {message.recommendations.map((rec, idx) => (
                                                                <li key={idx} className="text-[13px] text-slate-700 leading-snug flex items-start">
                                                                    <span className="inline-block w-1 h-1 bg-emerald-500 rounded-full mr-2.5 mt-2 flex-shrink-0" />
                                                                    <InlineMarkdown text={rec} className="flex-1" />
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {/* Proyección / Forecast */}
                                                {expandedForecast[index] && message.forecast && (
                                                    <div className="mt-4 relative bg-blue-50/50 border border-blue-100 p-4 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-300">
                                                        <div className="absolute left-0 top-3 bottom-3 w-1 bg-blue-500 rounded-full" />
                                                        <div className="pl-2 space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <LineChart className="w-3.5 h-3.5 text-blue-600" />
                                                                <span className="text-[10px] font-black uppercase tracking-wider text-blue-700">
                                                                    Proyección · Confianza {message.forecast.confidence} · R²={message.forecast.r2.toFixed(2)}
                                                                </span>
                                                            </div>
                                                            <p className="text-[12px] text-slate-600 leading-snug">{message.forecast.summary}</p>
                                                            <div className="overflow-x-auto">
                                                                <table className="text-[11px] w-full">
                                                                    <thead>
                                                                        <tr className="text-slate-400 border-b border-blue-100">
                                                                            <th className="text-left py-1 font-bold">Fecha</th>
                                                                            <th className="text-right py-1 font-bold">Estimado</th>
                                                                            <th className="text-right py-1 font-bold">Rango</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {message.forecast.forecast.slice(0, 14).map((p, i) => (
                                                                            <tr key={i} className="border-b border-blue-50 last:border-0">
                                                                                <td className="py-1 text-slate-600">{p.date}</td>
                                                                                <td className="py-1 text-right font-bold text-slate-900">{p.pointEstimate.toLocaleString('es-MX')}</td>
                                                                                <td className="py-1 text-right text-slate-500">{p.lowerBound.toLocaleString('es-MX')}–{p.upperBound.toLocaleString('es-MX')}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Feedback 👍/👎 */}
                                                {!message.streaming && message.content && !message.conversational && (
                                                    <div className="mt-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => sendFeedback(index, 'up')}
                                                            disabled={message.feedback === 'up'}
                                                            className={cn(
                                                                'p-1.5 rounded-full transition-colors',
                                                                message.feedback === 'up'
                                                                    ? 'bg-emerald-100 text-emerald-700'
                                                                    : 'text-slate-400 hover:bg-slate-100 hover:text-emerald-600'
                                                            )}
                                                            title="Buena respuesta"
                                                        >
                                                            <ThumbsUp className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => sendFeedback(index, 'down')}
                                                            disabled={message.feedback === 'down'}
                                                            className={cn(
                                                                'p-1.5 rounded-full transition-colors',
                                                                message.feedback === 'down'
                                                                    ? 'bg-rose-100 text-rose-700'
                                                                    : 'text-slate-400 hover:bg-slate-100 hover:text-rose-600'
                                                            )}
                                                            title="Necesita mejorar"
                                                        >
                                                            <ThumbsDown className="w-3.5 h-3.5" />
                                                        </button>
                                                        {message.feedback && (
                                                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider ml-1">
                                                                Gracias
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Footer: reportes sugeridos + preguntas */}
                                            {((message.suggested_reports && message.suggested_reports.length > 0) ||
                                                (message.suggestedQuestions && message.suggestedQuestions.length > 0)) && (
                                                    <div className="bg-slate-50/50 border-t border-slate-100 px-6 py-4 space-y-4">
                                                        {message.suggested_reports && message.suggested_reports.length > 0 && (
                                                            <div className="space-y-2">
                                                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                                                    Reportes relacionados
                                                                </span>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {message.suggested_reports.map((report, idx) => (
                                                                        <button
                                                                            key={idx}
                                                                            onClick={() => navigateToReport(report.path)}
                                                                            disabled={!report.path}
                                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-full transition-all border bg-white border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                                                                            title={report.reason}
                                                                        >
                                                                            <span>{report.report_name}</span>
                                                                            {report.path && <ExternalLink className="w-3 h-3" />}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {message.suggestedQuestions && message.suggestedQuestions.length > 0 && (
                                                            <div className="space-y-2">
                                                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                                                    Continuar
                                                                </span>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {message.suggestedQuestions.map((q, i) => (
                                                                        <button
                                                                            key={i}
                                                                            onClick={() => handleSend(q)}
                                                                            className="px-3 py-1.5 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-900 hover:text-white rounded-full transition-all border border-slate-200 hover:border-slate-900 active:scale-95"
                                                                        >
                                                                            {q}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                        </div>
                                    ) : (
                                        <p className="text-[16px] font-bold leading-relaxed whitespace-pre-wrap">{message.content}</p>
                                    )}
                                </div>
                                <span className="text-[10px] font-bold text-slate-400 mt-2 px-2 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                                    {new Date(message.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        ))}

                        {loading && !messages.some(m => m.streaming) && (
                            <div className="flex items-start space-x-3 animate-in fade-in duration-300">
                                <div className="p-4 bg-white border border-slate-200 rounded-[24px] rounded-tl-none shadow-xl flex items-center space-x-4">
                                    <div className="flex space-x-1">
                                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Analizando datos...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-6 bg-white border-t border-slate-100 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)]">
                        <ChatInput onSend={handleSend} isLoading={loading} />
                        <p className="text-[9px] text-center text-slate-400 mt-4 uppercase tracking-[0.3em] font-bold">Powered by Nexus Engine Analytics</p>
                    </div>
                </div>
            )}
        </div>
    );
}
