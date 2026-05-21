'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    FileSpreadsheet,
    FileText,
    Loader2,
    Store,
    Calendar,
    Users,
    TrendingUp,
    MapPin,
    ChevronRight,
    ArrowUpRight,
    LayoutGrid,
    RefreshCcw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import DatePresetsProfesores from '@/components/DatePresetsProfesores';
import SociosBySucursalModal from '@/components/SociosBySucursalModal';
import ProfesorVentasDetailModal from '@/components/ProfesorVentasDetailModal';
import VentasItemDetailModal from '@/components/VentasItemDetailModal';

const CARD_THEMES = [
    {
        bg: "bg-gradient-to-br from-blue-500/[0.03] to-indigo-500/[0.03] hover:from-blue-500/[0.08] hover:to-indigo-500/[0.08]",
        border: "border-slate-200/80 hover:border-blue-500/50",
        selectedBg: "bg-gradient-to-br from-blue-500/15 via-indigo-500/10 to-transparent border-blue-600 shadow-md shadow-blue-500/10",
        accentText: "text-blue-700",
        iconContainer: "bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-lg shadow-blue-500/20",
        arrowColor: "text-blue-500",
        pillBg: "bg-blue-50 text-blue-700 border border-blue-100",
        badgeGlow: "shadow-blue-500/30"
    },
    {
        bg: "bg-gradient-to-br from-purple-500/[0.03] to-fuchsia-500/[0.03] hover:from-purple-500/[0.08] hover:to-fuchsia-500/[0.08]",
        border: "border-slate-200/80 hover:border-purple-500/50",
        selectedBg: "bg-gradient-to-br from-purple-500/15 via-fuchsia-500/10 to-transparent border-purple-600 shadow-md shadow-purple-500/10",
        accentText: "text-purple-700",
        iconContainer: "bg-gradient-to-tr from-purple-600 to-fuchsia-500 text-white shadow-lg shadow-purple-500/20",
        arrowColor: "text-purple-500",
        pillBg: "bg-purple-50 text-purple-700 border border-purple-100",
        badgeGlow: "shadow-purple-500/30"
    },
    {
        bg: "bg-gradient-to-br from-emerald-500/[0.03] to-teal-500/[0.03] hover:from-emerald-500/[0.08] hover:to-teal-500/[0.08]",
        border: "border-slate-200/80 hover:border-emerald-500/50",
        selectedBg: "bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-transparent border-emerald-600 shadow-md shadow-emerald-500/10",
        accentText: "text-emerald-700",
        iconContainer: "bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-500/20",
        arrowColor: "text-emerald-500",
        pillBg: "bg-emerald-50 text-emerald-700 border border-emerald-100",
        badgeGlow: "shadow-emerald-500/30"
    },
    {
        bg: "bg-gradient-to-br from-amber-500/[0.03] to-orange-500/[0.03] hover:from-amber-500/[0.08] hover:to-orange-500/[0.08]",
        border: "border-slate-200/80 hover:border-amber-500/50",
        selectedBg: "bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-transparent border-amber-600 shadow-md shadow-amber-500/10",
        accentText: "text-amber-850",
        iconContainer: "bg-gradient-to-tr from-amber-600 to-orange-500 text-white shadow-lg shadow-amber-500/20",
        arrowColor: "text-amber-600",
        pillBg: "bg-amber-50 text-amber-700 border border-amber-100",
        badgeGlow: "shadow-amber-500/30"
    },
    {
        bg: "bg-gradient-to-br from-rose-500/[0.03] to-pink-500/[0.03] hover:from-rose-500/[0.08] hover:to-pink-500/[0.08]",
        border: "border-slate-200/80 hover:border-rose-500/50",
        selectedBg: "bg-gradient-to-br from-rose-500/15 via-pink-500/10 to-transparent border-rose-600 shadow-md shadow-rose-500/10",
        accentText: "text-rose-700",
        iconContainer: "bg-gradient-to-tr from-rose-600 to-pink-500 text-white shadow-lg shadow-rose-500/20",
        arrowColor: "text-rose-500",
        pillBg: "bg-rose-50 text-rose-700 border border-rose-100",
        badgeGlow: "shadow-rose-500/30"
    },
    {
        bg: "bg-gradient-to-br from-indigo-500/[0.03] to-blue-500/[0.03] hover:from-indigo-500/[0.08] hover:to-blue-500/[0.08]",
        border: "border-slate-200/80 hover:border-indigo-500/50",
        selectedBg: "bg-gradient-to-br from-indigo-500/15 via-blue-500/10 to-transparent border-indigo-600 shadow-md shadow-indigo-500/10",
        accentText: "text-indigo-700",
        iconContainer: "bg-gradient-to-tr from-indigo-600 to-blue-500 text-white shadow-lg shadow-indigo-500/20",
        arrowColor: "text-indigo-500",
        pillBg: "bg-indigo-50 text-indigo-700 border border-indigo-100",
        badgeGlow: "shadow-indigo-500/30"
    },
    {
        bg: "bg-gradient-to-br from-cyan-500/[0.03] to-sky-500/[0.03] hover:from-cyan-500/[0.08] hover:to-sky-500/[0.08]",
        border: "border-slate-200/80 hover:border-cyan-500/50",
        selectedBg: "bg-gradient-to-br from-cyan-500/15 via-sky-500/10 to-transparent border-cyan-600 shadow-md shadow-cyan-500/10",
        accentText: "text-cyan-700",
        iconContainer: "bg-gradient-to-tr from-cyan-600 to-sky-500 text-white shadow-lg shadow-cyan-500/20",
        arrowColor: "text-cyan-500",
        pillBg: "bg-cyan-50 text-cyan-700 border border-cyan-100",
        badgeGlow: "shadow-cyan-500/30"
    }
];

function getCardTheme(idx: number) {
    return CARD_THEMES[idx % CARD_THEMES.length];
}

function ReportContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [sucursalesSummary, setSucursalesSummary] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Modal State Stack
    const [isSociosModalOpen, setIsSociosModalOpen] = useState(false);
    const [selectedSucursal, setSelectedSucursal] = useState<{ id: string | number; name: string } | null>(null);

    const [isProfesorModalOpen, setIsProfesorModalOpen] = useState(false);
    const [selectedProfesor, setSelectedProfesor] = useState<{ id: number; name: string } | null>(null);

    const [isVentaModalOpen, setIsVentaModalOpen] = useState(false);
    const [selectedVenta, setSelectedVenta] = useState<{ id: number; folio: string; sucursalId: number } | null>(null);

    // Filter states from URL
    const startDate = searchParams.get('startDate') || getFirstOfMonth();
    const endDate = searchParams.get('endDate') || getToday();

    function getToday() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function getFirstOfMonth() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}-01`;
    }

    // Fetch branch summaries
    useEffect(() => {
        if (!startDate || !endDate) return;

        let isMounted = true;
        const fetchData = async () => {
            setLoading(true);
            setError(null);

            try {
                // Fetch for ALL sucursales
                const url = `/api/reportes/profesores/sucursales?startDate=${startDate}&endDate=${endDate}&sucursalId=all`;
                const response = await fetch(url);
                const result = await response.json();

                if (!response.ok) throw new Error(result.error || 'Failed to fetch branch summary');
                if (isMounted) setSucursalesSummary(result.data || []);
            } catch (err: any) {
                if (isMounted) setError(err.message);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData();
        return () => { isMounted = false; };
    }, [startDate, endDate]);

    const handleParamChange = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set(key, value);
        else params.delete(key);
        router.push(`?${params.toString()}`, { scroll: false });
    };

    const formatCurrency = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return val;
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
    };

    // Calculate "All Branches" totals
    const allBranchesSummary = useMemo(() => {
        if (sucursalesSummary.length === 0) return null;
        return {
            IdSucursal: 'all',
            Nombre: 'Todas las Sucursales',
            TotalVenta: sucursalesSummary.reduce((acc, curr) => acc + Number(curr.TotalVenta || 0), 0),
            TotalClientes: sucursalesSummary.reduce((acc, curr) => acc + Number(curr.TotalClientes || 0), 0),
        };
    }, [sucursalesSummary]);

    return (
        <div className="space-y-6">
            {/* Header with Filters & Periods */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white py-4 px-6 rounded-2xl shadow-sm border border-slate-100 animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3 select-none">
                        <Users className="text-blue-600" />
                        Reporte de Profesores
                    </h1>

                    <DatePresetsProfesores />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                        <Calendar size={16} className="text-blue-500" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Del</span>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => handleParamChange('startDate', e.target.value)}
                            className="bg-transparent text-xs font-bold text-slate-700 outline-none p-0 border-none h-auto w-28 cursor-pointer"
                        />
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                        <Calendar size={16} className="text-blue-500" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Al</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => handleParamChange('endDate', e.target.value)}
                            className="bg-transparent text-xs font-bold text-slate-700 outline-none p-0 border-none h-auto w-28 cursor-pointer"
                        />
                    </div>
                    <button
                        onClick={() => {
                            // Re-trigger params push to refresh
                            handleParamChange('startDate', startDate);
                        }}
                        className="p-2.5 bg-slate-50 border border-slate-200 text-blue-600 hover:bg-slate-100 hover:border-slate-300 transition-all rounded-xl shadow-sm"
                        disabled={loading}
                        title="Actualizar Datos"
                    >
                        <RefreshCcw size={16} className={cn(loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Branch Cards Grid */}
            {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center h-64 text-slate-500">
                    <Loader2 className="animate-spin mb-4 text-blue-600" size={40} />
                    <p className="font-medium">Cargando sucursales...</p>
                </div>
            ) : error ? (
                <div className="bg-red-50 border border-red-200 text-red-600 p-6 rounded-2xl flex flex-col items-center">
                    <p className="font-bold">Error al cargar datos</p>
                    <p className="text-sm mt-1">{error}</p>
                </div>
            ) : sucursalesSummary.length === 0 ? (
                <div className="bg-slate-50 border border-slate-200 text-slate-400 p-12 rounded-2xl flex flex-col items-center text-center">
                    <MapPin size={48} className="mb-4 opacity-20" />
                    <p className="font-medium">No se encontraron ventas en este periodo.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {/* Special Card: All Branches */}
                    {allBranchesSummary && (() => {
                        const theme = getCardTheme(0);
                        return (
                            <div
                                onClick={() => {
                                    setSelectedSucursal({ id: 'all', name: 'Todas las Sucursales' });
                                    setIsSociosModalOpen(true);
                                }}
                                className={cn(
                                    'cursor-pointer rounded-xl border p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg relative overflow-hidden group select-none flex flex-col justify-between min-h-[140px]',
                                    `bg-white ${theme.border} ${theme.bg}`
                                )}
                            >
                                {/* Top-Right Soft Decorative Radial Gradient */}
                                <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-bl-full pointer-events-none transition-transform duration-500 group-hover:scale-110"></div>
                                
                                {/* Left color bar indicator */}
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-200 group-hover:bg-indigo-500 transition-colors duration-300"></div>

                                <div>
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 shadow-xs", theme.iconContainer)}>
                                                <LayoutGrid size={16} />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-extrabold text-slate-800 truncate max-w-[125px] tracking-tight">{allBranchesSummary.Nombre}</h3>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Global</p>
                                            </div>
                                        </div>
                                        <div className={cn("transition-all duration-300 transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5", theme.arrowColor)}>
                                            <ArrowUpRight size={16} />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2 mt-auto pt-2 border-t border-slate-100/80">
                                    <div className="flex items-baseline justify-between gap-1">
                                        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Venta Global</span>
                                        <span className={cn("text-base font-black tracking-tight", theme.accentText)}>
                                            {formatCurrency(allBranchesSummary.TotalVenta)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-slate-400 font-semibold">Clientes Totales</span>
                                        <span className={cn("font-bold text-[10px] px-2 py-0.25 rounded-full", theme.pillBg)}>
                                            {allBranchesSummary.TotalClientes}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Branch Cards */}
                    {sucursalesSummary.map((suc, idx) => {
                        const theme = getCardTheme(idx + 1);
                        return (
                            <div 
                                key={suc.IdSucursal}
                                onClick={() => {
                                    setSelectedSucursal({ id: suc.IdSucursal, name: suc.Nombre });
                                    setIsSociosModalOpen(true);
                                }}
                                className={cn(
                                    'cursor-pointer rounded-xl border p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg relative overflow-hidden group select-none flex flex-col justify-between min-h-[140px]',
                                    `bg-white ${theme.border} ${theme.bg}`
                                )}
                            >
                                {/* Top-Right Soft Decorative Radial Gradient */}
                                <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-current opacity-[0.04] rounded-bl-full pointer-events-none transition-transform duration-500 group-hover:scale-110"></div>
                                
                                {/* Left color bar indicator */}
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-200 group-hover:bg-blue-500 transition-colors duration-300"></div>

                                <div>
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 shadow-xs", theme.iconContainer)}>
                                                <Store size={16} />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-extrabold text-slate-800 truncate max-w-[125px] tracking-tight group-hover:text-blue-600 transition-colors">{suc.Nombre}</h3>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sucursal</p>
                                            </div>
                                        </div>
                                        <div className={cn("transition-all duration-300 transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5", theme.arrowColor)}>
                                            <ArrowUpRight size={16} />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2 mt-auto pt-2 border-t border-slate-100/80">
                                    <div className="flex items-baseline justify-between gap-1">
                                        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Venta Total</span>
                                        <span className={cn("text-base font-black tracking-tight", theme.accentText)}>
                                            {formatCurrency(suc.TotalVenta)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-slate-400 font-semibold">Clientes</span>
                                        <span className={cn("font-bold text-[10px] px-2 py-0.25 rounded-full", theme.pillBg)}>
                                            {suc.TotalClientes}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* MODAL STACK */}
            
            {/* Level 1: Socios in Branch */}
            <SociosBySucursalModal 
                isOpen={isSociosModalOpen}
                onClose={() => setIsSociosModalOpen(false)}
                idSucursal={selectedSucursal?.id as any}
                sucursalName={selectedSucursal?.name || ''}
                startDate={startDate}
                endDate={endDate}
                onSocioClick={(socio) => {
                    setSelectedProfesor(socio);
                    setIsProfesorModalOpen(true);
                }}
            />

            {/* Level 2: Sales of Socio */}
            <ProfesorVentasDetailModal 
                isOpen={isProfesorModalOpen}
                onClose={() => setIsProfesorModalOpen(false)}
                idSocio={selectedProfesor?.id || null}
                socioName={selectedProfesor?.name || ''}
                startDate={startDate}
                endDate={endDate}
                sucursalId={String(selectedSucursal?.id || 'all')}
                onSaleClick={(sale) => {
                    setSelectedVenta(sale);
                    setIsVentaModalOpen(true);
                }}
            />

            {/* Level 3: Sale Items */}
            <VentasItemDetailModal 
                isOpen={isVentaModalOpen}
                onClose={() => setIsVentaModalOpen(false)}
                idVenta={selectedVenta?.id || null}
                idSucursal={selectedVenta?.sucursalId || null}
                folioVenta={selectedVenta?.folio || ''}
                clienteName={selectedProfesor?.name || ''}
            />
        </div>
    );
}

export default function ReporteProfesoresPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin text-blue-600" size={40} />
            </div>
        }>
            <ReportContent />
        </Suspense>
    );
}
