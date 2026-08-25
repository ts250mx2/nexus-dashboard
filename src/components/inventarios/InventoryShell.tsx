'use client';

import React from 'react';
import { RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Encabezado, tarjetas KPI y estados de carga compartidos por los tableros de
 * inventario. Mantiene el mismo lenguaje visual que el resto del portal.
 */

interface InventoryHeaderProps {
    title: string;
    icon: React.ElementType;
    badge?: string;
    lastUpdated?: string;
    loading?: boolean;
    onRefresh: () => void;
    children?: React.ReactNode;
}

export function InventoryHeader({
    title,
    icon: Icon,
    badge,
    lastUpdated,
    loading = false,
    onRefresh,
    children,
}: InventoryHeaderProps) {
    return (
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white py-4 px-6 rounded-2xl shadow-xs border border-slate-100 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
                <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3 select-none">
                    <Icon className="text-blue-600 shrink-0" />
                    {title}
                </h1>
                {badge && (
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full px-3.5 py-1">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{badge}</span>
                    </div>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
                {children}
                {lastUpdated && (
                    <p className="text-xs font-semibold text-slate-400">
                        Última consulta: <span className="text-slate-600 font-bold">{lastUpdated}</span>
                    </p>
                )}
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={loading}
                    title="Actualizar"
                    className="p-2.5 bg-slate-50 border border-slate-200 text-blue-600 hover:bg-slate-100 hover:border-slate-300 transition-all rounded-xl shadow-xs cursor-pointer flex items-center justify-center disabled:opacity-50"
                >
                    <RefreshCcw size={16} className={cn(loading && 'animate-spin')} />
                </button>
            </div>
        </div>
    );
}

type KpiTone = 'blue' | 'rose' | 'amber' | 'emerald' | 'slate' | 'violet';

const TONES: Record<KpiTone, { tile: string; hover: string; value: string; accent: string }> = {
    blue: { tile: 'bg-blue-50 text-blue-600', hover: 'group-hover:bg-blue-600', value: 'text-slate-950', accent: 'text-blue-600' },
    rose: { tile: 'bg-rose-50 text-rose-600', hover: 'group-hover:bg-rose-600', value: 'text-rose-600', accent: 'text-rose-600' },
    amber: { tile: 'bg-amber-50 text-amber-600', hover: 'group-hover:bg-amber-600', value: 'text-amber-600', accent: 'text-amber-600' },
    emerald: { tile: 'bg-emerald-50 text-emerald-600', hover: 'group-hover:bg-emerald-600', value: 'text-emerald-600', accent: 'text-emerald-600' },
    slate: { tile: 'bg-slate-50 text-slate-600', hover: 'group-hover:bg-slate-800', value: 'text-slate-950', accent: 'text-slate-700' },
    violet: { tile: 'bg-violet-50 text-violet-600', hover: 'group-hover:bg-violet-600', value: 'text-violet-600', accent: 'text-violet-600' },
};

interface KpiCardProps {
    label: string;
    value: string;
    hint?: React.ReactNode;
    icon: React.ElementType;
    tone?: KpiTone;
    onClick?: () => void;
}

export function KpiCard({ label, value, hint, icon: Icon, tone = 'blue', onClick }: KpiCardProps) {
    const t = TONES[tone];
    const clickable = typeof onClick === 'function';

    return (
        <div
            onClick={onClick}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!(); } } : undefined}
            className={cn(
                'bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-4 transition-all group',
                clickable && 'hover:shadow-md hover:scale-[1.01] cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
            )}
        >
            <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all group-hover:text-white', t.tile, t.hover)}>
                <Icon size={24} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider truncate">{label}</p>
                <h3 className={cn('text-2xl font-black mt-0.5 tabular-nums truncate', t.value)}>{value}</h3>
                {hint && <p className="text-[10px] font-semibold text-slate-400 mt-0.5 truncate">{hint}</p>}
            </div>
        </div>
    );
}

export function LoadingState({ message }: { message: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
            <RefreshCcw size={40} className="animate-spin text-blue-600" />
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest animate-pulse">{message}</p>
        </div>
    );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white rounded-2xl border border-rose-100">
            <p className="text-sm font-bold text-rose-600 uppercase tracking-wider">No se pudo cargar el reporte</p>
            <p className="text-xs text-slate-500 max-w-md text-center">{message}</p>
            <button
                type="button"
                onClick={onRetry}
                className="px-4 py-2 bg-blue-600 text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-blue-700 transition-colors cursor-pointer"
            >
                Reintentar
            </button>
        </div>
    );
}

export function Panel({ title, subtitle, children, action }: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-3">
                <div>
                    <h2 className="text-lg font-extrabold text-slate-800 uppercase tracking-wider">{title}</h2>
                    {subtitle && (
                        <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest mt-0.5">{subtitle}</p>
                    )}
                </div>
                {action}
            </div>
            {children}
        </div>
    );
}
