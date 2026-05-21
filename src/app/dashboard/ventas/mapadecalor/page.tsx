"use client";

import { useState, useEffect, useCallback } from 'react';
import {
    Calendar,
    RefreshCcw,
    Store,
    Flame,
    LayoutGrid,
    ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const HOURS = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

const DEFAULT_COLORS = [
    '#3B82F6', // Blue
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#EC4899', // Pink
    '#8B5CF6', // Purple
    '#06B6D4', // Cyan
    '#F97316', // Orange
    '#EF4444', // Red
];

const getStoreColor = (name: string, index: number) => {
    if (!name) return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorIndex = Math.abs(hash) % DEFAULT_COLORS.length;
    return DEFAULT_COLORS[colorIndex];
};

export default function HeatmapPage() {
    const getFormattedDate = (offset = 0) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getStartOfWeek = () => {
        const d = new Date();
        const day = d.getDay();
        const diff = (day + 6) % 7; // Monday-based week start
        d.setDate(d.getDate() - diff);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const dayStr = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${dayStr}`;
    };

    const today = getFormattedDate(0);
    const yesterday = getFormattedDate(-1);
    
    const currentMonthStart = (() => {
        const d = new Date();
        d.setDate(1);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}-01`;
    })();

    const [fechaInicio, setFechaInicio] = useState(currentMonthStart);
    const [fechaFin, setFechaFin] = useState(today);
    const [selectedStoreId, setSelectedStoreId] = useState<string>('all');
    const [selectedMetric, setSelectedMetric] = useState<'ventas' | 'operaciones' | 'ticket_promedio'>('ventas');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any[]>([]);
    const [stores, setStores] = useState<any[]>([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const url = `/api/dashboard/sales/heatmap?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}&idTienda=${selectedStoreId}`;
            const res = await fetch(url);
            const json = await res.json();
            setData(json.data || []);
            setStores(json.stores || []);
        } catch (err) {
            console.error('Error fetching heatmap data:', err);
        } finally {
            setLoading(false);
        }
    }, [fechaInicio, fechaFin, selectedStoreId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const getIntensityColor = (value: number, max: number) => {
        if (value === 0) return 'bg-slate-50 hover:bg-slate-100/80';
        const ratio = value / max;
        
        if (selectedMetric === 'ventas') {
            if (ratio < 0.2) return 'bg-blue-500/10 text-blue-700 hover:bg-blue-500/20';
            if (ratio < 0.4) return 'bg-blue-500/30 text-blue-800 hover:bg-blue-500/40';
            if (ratio < 0.6) return 'bg-blue-500/50 text-blue-900 hover:bg-blue-500/60';
            if (ratio < 0.8) return 'bg-blue-500/70 text-white hover:bg-blue-500/80';
            return 'bg-blue-600 text-white hover:bg-blue-700';
        } else if (selectedMetric === 'operaciones') {
            if (ratio < 0.2) return 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20';
            if (ratio < 0.4) return 'bg-emerald-500/30 text-emerald-800 hover:bg-emerald-500/40';
            if (ratio < 0.6) return 'bg-emerald-500/50 text-emerald-900 hover:bg-emerald-500/60';
            if (ratio < 0.8) return 'bg-emerald-500/70 text-white hover:bg-emerald-500/80';
            return 'bg-emerald-600 text-white hover:bg-emerald-700';
        } else {
            // Ticket Promedio - Amber
            if (ratio < 0.2) return 'bg-amber-500/10 text-amber-700 hover:bg-amber-500/20';
            if (ratio < 0.4) return 'bg-amber-500/30 text-amber-800 hover:bg-amber-500/40';
            if (ratio < 0.6) return 'bg-amber-500/50 text-amber-900 hover:bg-amber-500/60';
            if (ratio < 0.8) return 'bg-amber-500/70 text-white hover:bg-amber-500/80';
            return 'bg-amber-600 text-white hover:bg-amber-700';
        }
    };

    const maxValue = Math.max(...data.map(d => {
        if (selectedMetric === 'ventas') return Number(d.TotalVentas);
        if (selectedMetric === 'operaciones') return Number(d.CantidadTickets);
        return Number(d.TotalVentas) / (Number(d.CantidadTickets) || 1);
    }), 1);

    // Create a 7x24 matrix for easy lookup
    const matrix: Record<string, number> = {};
    data.forEach(d => {
        const val = selectedMetric === 'ventas' ? Number(d.TotalVentas) : 
                   selectedMetric === 'operaciones' ? Number(d.CantidadTickets) :
                   Number(d.TotalVentas) / (Number(d.CantidadTickets) || 1);
        matrix[`${d.DiaSemana}-${d.Hora}`] = val;
        // Keep tickets stored for the tooltip when in sales mode
        matrix[`${d.DiaSemana}-${d.Hora}-tickets`] = Number(d.CantidadTickets);
        matrix[`${d.DiaSemana}-${d.Hora}-sales`] = Number(d.TotalVentas);
    });

    const periods = [
        { label: 'Hoy', start: today, end: today },
        { label: 'Ayer', start: yesterday, end: yesterday },
        { label: 'Semana', start: getStartOfWeek(), end: today },
        { label: '7 días', start: getFormattedDate(-6), end: today },
        { label: 'Este mes', start: currentMonthStart, end: today },
        {
            label: 'Mes ant.',
            start: (() => {
                const d = new Date();
                d.setMonth(d.getMonth() - 1);
                d.setDate(1);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                return `${year}-${month}-01`;
            })(),
            end: (() => {
                const d = new Date();
                d.setDate(0);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            })()
        },
    ];

    const formatValue = (val: number) => {
        if (selectedMetric === 'ventas' || selectedMetric === 'ticket_promedio') {
            return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(val);
        }
        return new Intl.NumberFormat('es-MX').format(val);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header with Filters & Periods */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white py-4 px-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3">
                        <Flame 
                            className={cn(
                                "transition-colors duration-300", 
                                selectedMetric === 'ventas' ? "text-blue-500" : 
                                selectedMetric === 'operaciones' ? "text-emerald-500" : "text-amber-500"
                            )} 
                            fill="currentColor" 
                        />
                        Mapa de Calor
                    </h1>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Quick Date Period Buttons */}
                    <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-xl p-1 overflow-x-auto no-scrollbar">
                        {periods.map(({ label, start, end }) => {
                            const isActive = fechaInicio === start && fechaFin === end;
                            return (
                                <button
                                    key={label}
                                    onClick={() => { setFechaInicio(start); setFechaFin(end); }}
                                    className={cn(
                                        'px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap',
                                        isActive ? 'bg-blue-600 text-white shadow-sm font-black' : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                                    )}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                            <Calendar size={16} className="text-blue-500" />
                            <input
                                type="date"
                                value={fechaInicio}
                                onChange={(e) => setFechaInicio(e.target.value)}
                                className="bg-transparent text-xs font-bold text-slate-700 outline-none p-0 border-none h-auto w-28"
                            />
                        </div>
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                            <Calendar size={16} className="text-blue-500" />
                            <input
                                type="date"
                                value={fechaFin}
                                onChange={(e) => setFechaFin(e.target.value)}
                                className="bg-transparent text-xs font-bold text-slate-700 outline-none p-0 border-none h-auto w-28"
                            />
                        </div>
                        <button
                            onClick={fetchData}
                            className="p-2.5 bg-slate-50 border border-slate-200 text-blue-600 hover:bg-slate-100 hover:border-slate-300 transition-all rounded-xl shadow-sm"
                            title="Actualizar Datos"
                        >
                            <RefreshCcw size={16} className={cn(loading && "animate-spin")} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Area with Sidebar and Heatmap Grid */}
            <div className="flex flex-col lg:flex-row gap-6">
                {/* Branch selector list card */}
                <div className="lg:w-72 shrink-0">
                    <div className="bg-white border border-slate-100 shadow-sm overflow-hidden flex flex-col h-[580px] rounded-2xl">
                        <div className="p-4 bg-slate-50 border-b border-slate-100">
                             <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <Store size={14} />
                                Seleccionar Sucursal
                             </h2>
                        </div>
                        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-1 bg-white">
                            <button
                                onClick={() => setSelectedStoreId('all')}
                                className={cn(
                                    "w-full flex items-center justify-between p-3.5 transition-all border-l-4 rounded-xl group mb-2",
                                    selectedStoreId === 'all' 
                                        ? "bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/10"
                                        : "bg-white text-slate-600 border-transparent hover:bg-slate-50 hover:border-slate-200"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black transition-all",
                                        selectedStoreId === 'all' ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                                    )}>
                                        AZ
                                    </div>
                                    <span className="text-xs font-black tracking-tight uppercase">Todas las sucursales</span>
                                </div>
                                <ChevronRight size={14} className={cn(
                                    "transition-transform",
                                    selectedStoreId === 'all' ? "translate-x-0" : "-translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0"
                                )} />
                            </button>

                            {stores.map((store, i) => {
                                const isActive = selectedStoreId === store.IdSucursal.toString();
                                const color = getStoreColor(store.Tienda, i);
                                return (
                                    <button
                                        key={store.IdSucursal}
                                        onClick={() => setSelectedStoreId(store.IdSucursal.toString())}
                                        className={cn(
                                            "w-full flex items-center justify-between p-3.5 transition-all border-l-4 rounded-xl group",
                                            isActive 
                                                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-100 border-l-4"
                                                : "bg-white text-slate-600 border-transparent hover:bg-slate-50"
                                        )}
                                        style={{ borderLeftColor: isActive ? color : 'transparent' }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div 
                                                className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black text-white shadow-sm"
                                                style={{ backgroundColor: color }}
                                            >
                                                {store.Tienda.substring(0, 2).toUpperCase()}
                                            </div>
                                            <span className={cn(
                                                "text-xs font-black tracking-tight uppercase",
                                                isActive ? "text-slate-900" : "text-slate-500 group-hover:text-slate-800"
                                            )}>{store.Tienda}</span>
                                        </div>
                                        <ChevronRight size={14} className={cn(
                                            "transition-transform text-slate-400",
                                            isActive ? "translate-x-0" : "-translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0"
                                        )} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Heatmap Grid Area */}
                <div className="flex-1 min-w-0">
                    <div className="bg-white border border-slate-100 shadow-sm relative p-5 h-[580px] rounded-2xl flex flex-col">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 pb-4 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <span className={cn(
                                    "w-2.5 h-2.5 rounded-full shrink-0",
                                    selectedMetric === 'ventas' ? "bg-blue-500 animate-ping" : 
                                    selectedMetric === 'operaciones' ? "bg-emerald-500 animate-ping" : "bg-amber-500 animate-ping"
                                )} />
                                <h2 className="text-base font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                                    {selectedMetric === 'ventas' ? 'Distribución de Ventas' : selectedMetric === 'operaciones' ? 'Distribución de Operaciones' : 'Distribución de Ticket Promedio'}
                                    <span className="text-slate-300 font-light">/</span>
                                    <span className={cn(
                                        "text-xs font-bold uppercase tracking-wider",
                                        selectedMetric === 'ventas' ? "text-blue-600" : 
                                        selectedMetric === 'operaciones' ? "text-emerald-600" : "text-amber-600"
                                    )}>
                                        {selectedStoreId === 'all' ? 'Todas las sucursales' : stores.find(s => s.IdSucursal.toString() === selectedStoreId)?.Tienda}
                                    </span>
                                </h2>
                            </div>

                            <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-xl p-1 shrink-0 select-none">
                                <button
                                    onClick={() => setSelectedMetric('ventas')}
                                    className={cn(
                                        'px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap',
                                        selectedMetric === 'ventas' 
                                            ? 'bg-blue-600 text-white shadow-sm font-black' 
                                            : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                                    )}
                                >
                                    Venta
                                </button>
                                <button
                                    onClick={() => setSelectedMetric('operaciones')}
                                    className={cn(
                                        'px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap',
                                        selectedMetric === 'operaciones' 
                                            ? 'bg-emerald-600 text-white shadow-sm font-black' 
                                            : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                                    )}
                                >
                                    Operaciones
                                </button>
                                <button
                                    onClick={() => setSelectedMetric('ticket_promedio')}
                                    className={cn(
                                        'px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap',
                                        selectedMetric === 'ticket_promedio' 
                                            ? 'bg-amber-600 text-white shadow-sm font-black' 
                                            : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                                    )}
                                >
                                    Ticket Promedio
                                </button>
                            </div>
                        </div>

                        {loading && (
                            <div className="absolute inset-0 z-50 bg-white/70 backdrop-blur-[1px] flex flex-col items-center justify-center gap-3 rounded-2xl">
                                <RefreshCcw size={32} className="animate-spin text-blue-500" />
                                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest animate-pulse">Generando Mapa...</p>
                            </div>
                        )}

                        <div className="flex-1 overflow-x-auto custom-scrollbar pb-4 pt-10">
                            <div className="min-w-[980px] pr-2">
                                {/* Heatmap Header - Hours */}
                                <div className="flex mb-3">
                                    <div className="w-24 shrink-0" /> {/* Spacer for Days column */}
                                    <div className="flex-1 flex">
                                        {HOURS.map(hour => (
                                            <div key={hour} className="flex-1 text-center relative h-6">
                                                <span className="text-[9px] font-black text-slate-400 text-center block absolute left-1/2 -translate-x-1/2 rotate-[-45deg] origin-center -translate-y-4 whitespace-nowrap">
                                                    {hour}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Heatmap Rows - Days */}
                                <div className="space-y-1.5">
                                    {DAYS.map((day, dIdx) => {
                                        const diaId = ((dIdx + 1) % 7) + 1; 

                                        return (
                                            <div key={day} className="flex items-center">
                                                <div className="w-24 shrink-0 pr-4">
                                                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-tighter text-right block">
                                                        {day}
                                                    </span>
                                                </div>
                                                <div className="flex-1 flex gap-1 h-10">
                                                    {Array.from({ length: 24 }).map((_, h) => {
                                                        const val = matrix[`${diaId}-${h}`] || 0;
                                                        const colorClass = getIntensityColor(val, maxValue);
                                                        
                                                        return (
                                                            <div 
                                                                key={h}
                                                                className={cn(
                                                                    "flex-1 transition-all duration-200 rounded-sm flex flex-col items-center justify-center group relative cursor-pointer border border-transparent hover:scale-105 hover:z-10 hover:shadow-sm",
                                                                    colorClass
                                                                )}
                                                            >
                                                                {val > 0 && (
                                                                    <div className={cn(
                                                                        "absolute left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-slate-900 text-white z-50 transition-all pointer-events-none p-3 rounded-xl shadow-2xl border border-slate-800 w-44 leading-relaxed",
                                                                        dIdx < 3 ? "top-full mt-2" : "bottom-full mb-2"
                                                                    )}>
                                                                        <p className="text-[9px] font-black uppercase text-slate-400 mb-1.5 text-center tracking-wider">{day} @ {h}:00</p>
                                                                        <div className="space-y-1 text-xs">
                                                                            <div className="flex justify-between items-center gap-4">
                                                                                <span className="text-slate-400 font-medium">Monto Venta:</span>
                                                                                <span className="font-black text-white">{formatValue(matrix[`${diaId}-${h}-sales`] || 0)}</span>
                                                                            </div>
                                                                            <div className="flex justify-between items-center gap-4">
                                                                                <span className="text-slate-400 font-medium">Tickets (Ops):</span>
                                                                                <span className="font-black text-emerald-400">{matrix[`${diaId}-${h}-tickets`] || 0}</span>
                                                                            </div>
                                                                            <div className="flex justify-between items-center gap-4 pt-1 border-t border-slate-800 mt-1">
                                                                                <span className="text-slate-400 font-medium">Ticket Prom:</span>
                                                                                <span className="font-black text-amber-400">
                                                                                    {formatValue((matrix[`${diaId}-${h}-sales`] || 0) / (matrix[`${diaId}-${h}-tickets`] || 1))}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Legend */}
                        <div className="mt-auto flex items-center justify-end gap-4 border-t border-slate-100 pt-4">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                                Intensidad ({selectedMetric === 'ventas' ? 'Venta' : selectedMetric === 'operaciones' ? 'Operaciones' : 'Ticket Promedio'}):
                            </span>
                            <div className="flex items-center gap-1">
                                <span className="text-[9px] font-bold text-slate-400 mr-1">Menor</span>
                                <div className="w-5 h-5 rounded bg-slate-100 border border-slate-200/50" />
                                <div className={cn("w-5 h-5 rounded", 
                                    selectedMetric === 'ventas' ? "bg-blue-500/10" : 
                                    selectedMetric === 'operaciones' ? "bg-emerald-500/10" : "bg-amber-500/10"
                                )} />
                                <div className={cn("w-5 h-5 rounded", 
                                    selectedMetric === 'ventas' ? "bg-blue-500/30" : 
                                    selectedMetric === 'operaciones' ? "bg-emerald-500/30" : "bg-amber-500/30"
                                )} />
                                <div className={cn("w-5 h-5 rounded", 
                                    selectedMetric === 'ventas' ? "bg-blue-500/50" : 
                                    selectedMetric === 'operaciones' ? "bg-emerald-500/50" : "bg-amber-500/50"
                                )} />
                                <div className={cn("w-5 h-5 rounded", 
                                    selectedMetric === 'ventas' ? "bg-blue-500/70" : 
                                    selectedMetric === 'operaciones' ? "bg-emerald-500/70" : "bg-amber-500/70"
                                )} />
                                <div className={cn("w-5 h-5 rounded shadow-sm border border-black/5", 
                                    selectedMetric === 'ventas' ? "bg-blue-600" : 
                                    selectedMetric === 'operaciones' ? "bg-emerald-600" : "bg-amber-600"
                                )} />
                                <span className="text-[9px] font-bold text-slate-400 ml-1">Mayor</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
