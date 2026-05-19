'use client';

import { useState, useEffect, useRef } from 'react';
import { History, Plus, Trash2, MessageSquare, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConversationSummary {
    id: string;
    title: string;
    updated_at: string;
    created_at: string;
}

interface ConversationsDropdownProps {
    activeId: string | null;
    onSelect: (id: string) => void;
    onNew: () => void;
    refreshKey?: number;
}

function formatRelativeDate(iso: string): string {
    try {
        const d = new Date(iso);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        const diffHr = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHr / 24);

        if (diffMin < 1) return 'Ahora';
        if (diffMin < 60) return `Hace ${diffMin} min`;
        if (diffHr < 24) return `Hace ${diffHr}h`;
        if (diffDay < 7) return `Hace ${diffDay}d`;
        return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    } catch {
        return '';
    }
}

export function ConversationsDropdown({ activeId, onSelect, onNew, refreshKey }: ConversationsDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const fetchList = async () => {
        setLoading(true);
        try {
            const r = await fetch('/api/agent/conversations');
            const data = await r.json();
            if (Array.isArray(data.conversations)) {
                setConversations(data.conversations);
            }
        } catch (e) {
            console.error('Error cargando conversaciones:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) fetchList();
    }, [isOpen]);

    useEffect(() => {
        if (refreshKey && isOpen) fetchList();
    }, [refreshKey, isOpen]);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleDelete = async (e: React.MouseEvent | React.KeyboardEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('¿Eliminar esta conversación? No se puede deshacer.')) return;

        setDeleting(id);
        try {
            await fetch(`/api/agent/conversations/${id}`, { method: 'DELETE' });
            setConversations(prev => prev.filter(c => c.id !== id));
            if (activeId === id) onNew();
        } catch (e) {
            console.error('Error eliminando conversación:', e);
        } finally {
            setDeleting(null);
        }
    };

    return (
        <div ref={containerRef} className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors text-slate-500"
                title="Historial de conversaciones"
            >
                <History className="w-4 h-4" />
                <span className="text-[11px] font-bold uppercase tracking-wider hidden md:inline">Historial</span>
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-[340px] max-h-[500px] bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-3 border-b border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                            Tus conversaciones
                        </span>
                        <button
                            onClick={() => {
                                onNew();
                                setIsOpen(false);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                            <Plus className="w-3 h-3" />
                            Nueva
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {loading && conversations.length === 0 ? (
                            <div className="p-8 flex flex-col items-center gap-2 text-slate-400">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span className="text-[11px] font-medium">Cargando...</span>
                            </div>
                        ) : conversations.length === 0 ? (
                            <div className="p-8 flex flex-col items-center gap-2 text-slate-400 text-center">
                                <MessageSquare className="w-8 h-8 opacity-40" />
                                <span className="text-[12px] font-medium">
                                    No tienes conversaciones guardadas todavía.
                                </span>
                                <span className="text-[10px] text-slate-400">
                                    Empieza una nueva pregunta y se guardará automáticamente.
                                </span>
                            </div>
                        ) : (
                            <div className="py-1">
                                {conversations.map((c) => {
                                    const isActive = c.id === activeId;
                                    const isDeleting = deleting === c.id;
                                    return (
                                        <button
                                            key={c.id}
                                            onClick={() => {
                                                onSelect(c.id);
                                                setIsOpen(false);
                                            }}
                                            disabled={isDeleting}
                                            className={cn(
                                                "w-full text-left px-3 py-2.5 flex items-center gap-3 group transition-colors",
                                                isActive ? "bg-blue-50" : "hover:bg-slate-50",
                                                isDeleting && "opacity-50"
                                            )}
                                        >
                                            <div className={cn(
                                                "flex-shrink-0 w-1 h-8 rounded-full transition-colors",
                                                isActive ? "bg-blue-500" : "bg-transparent group-hover:bg-slate-200"
                                            )} />
                                            <div className="flex-1 min-w-0">
                                                <p className={cn(
                                                    "text-[13px] font-bold truncate leading-snug",
                                                    isActive ? "text-blue-700" : "text-slate-700"
                                                )}>
                                                    {c.title}
                                                </p>
                                                <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                                                    {formatRelativeDate(c.updated_at)}
                                                </p>
                                            </div>
                                            <span
                                                role="button"
                                                tabIndex={0}
                                                onClick={(e) => handleDelete(e, c.id)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        handleDelete(e, c.id);
                                                    }
                                                }}
                                                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-rose-100 rounded-lg transition-all flex-shrink-0 cursor-pointer"
                                                title="Eliminar"
                                            >
                                                {isDeleting ? (
                                                    <Loader2 className="w-3.5 h-3.5 text-rose-400 animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                                )}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
