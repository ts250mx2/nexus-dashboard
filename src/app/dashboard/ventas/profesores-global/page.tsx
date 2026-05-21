'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowRight,
    Calendar,
    FileText,
    LayoutGrid,
    Loader2,
    Store,
    Users,
    RefreshCcw
} from 'lucide-react';
import DatePresetsProfesores from '@/components/DatePresetsProfesores';
import VentasItemDetailModal from '@/components/VentasItemDetailModal';
import { cn } from '@/lib/utils';

interface Branch {
    IdSucursal: string | number;
    Nombre: string;
    TotalVenta: number;
    TotalClientes: number;
}

interface Profesor {
    IdSocio: number;
    Cliente: string;
    Sucursal: string;
    TotalVentas: number;
    ImporteTotal: number;
    TicketPromedio: number;
}

interface Articulo {
    IdArticulo: number;
    Articulo: string;
    Cantidad: number;
    Total: number;
    NumeroTickets: number;
    TicketPromedio: number;
}

interface VentaDetalle {
    IdVenta: number;
    IdSucursal: number;
    Folio: string;
    Fecha: string;
    Sucursal: string;
    CantidadArticulo: number;
    TotalArticulo: number;
    TotalVenta: number;
}

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

export default function ProfesoresGlobalPage() {
    const router = useRouter();

    const [branches, setBranches] = useState<Branch[]>([]);
    const [profesores, setProfesores] = useState<Profesor[]>([]);
    const [articulos, setArticulos] = useState<Articulo[]>([]);
    const [startDate, setStartDate] = useState(getFirstOfMonth());
    const [endDate, setEndDate] = useState(getToday());

    const [selectedSucursal, setSelectedSucursal] = useState<Branch | null>(null);
    const [selectedProfesor, setSelectedProfesor] = useState<Profesor | null>(null);
    const [selectedArticleForSales, setSelectedArticleForSales] = useState<Articulo | null>(null);
    const [selectedVenta, setSelectedVenta] = useState<VentaDetalle | null>(null);

    const [articleSales, setArticleSales] = useState<VentaDetalle[]>([]);
    const [loadingArticleSales, setLoadingArticleSales] = useState(false);
    const [errorArticleSales, setErrorArticleSales] = useState<string | null>(null);
    const [isArticleSalesModalOpen, setIsArticleSalesModalOpen] = useState(false);

    const [loadingBranches, setLoadingBranches] = useState(false);
    const [loadingProfesores, setLoadingProfesores] = useState(false);
    const [loadingArticulos, setLoadingArticulos] = useState(false);

    const [errorBranches, setErrorBranches] = useState<string | null>(null);
    const [errorProfesores, setErrorProfesores] = useState<string | null>(null);
    const [errorArticulos, setErrorArticulos] = useState<string | null>(null);

    const [initialSucursalId, setInitialSucursalId] = useState<string | null>(null);
    const [initialProfesorId, setInitialProfesorId] = useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const start = params.get('startDate') || getFirstOfMonth();
        const end = params.get('endDate') || getToday();

        setStartDate(start);
        setEndDate(end);
        setInitialSucursalId(params.get('sucursalId'));
        setInitialProfesorId(params.get('profesorId'));
    }, []);

    const updateQueryParams = (updates: Record<string, string | null>) => {
        const nextParams = new URLSearchParams(window.location.search);
        Object.entries(updates).forEach(([key, value]) => {
            if (value) nextParams.set(key, value);
            else nextParams.delete(key);
        });
        router.push(`?${nextParams.toString()}`, { scroll: false });
    };

    const handleSucursalSelect = (branch: Branch) => {
        setSelectedSucursal(branch);
        setSelectedProfesor(null);
        setSelectedArticleForSales(null);
        setArticleSales([]);
        setSelectedVenta(null);
        updateQueryParams({ sucursalId: String(branch.IdSucursal), profesorId: null, articuloId: null, startDate, endDate });
    };

    const handleProfesorSelect = (prof: Profesor) => {
        setSelectedProfesor(prof);
        setSelectedArticleForSales(null);
        setArticleSales([]);
        setSelectedVenta(null);
        updateQueryParams({ profesorId: String(prof.IdSocio), articuloId: null, startDate, endDate });
    };

    const handleArticleSelect = (art: Articulo) => {
        setSelectedArticleForSales(art);
        setArticleSales([]);
        setSelectedVenta(null);
        setIsArticleSalesModalOpen(true);
        updateQueryParams({ articuloId: String(art.IdArticulo) });
    };

    useEffect(() => {
        if (!startDate || !endDate) return;

        let isMounted = true;
        const fetchBranches = async () => {
            setLoadingBranches(true);
            setErrorBranches(null);

            try {
                const response = await fetch(`/api/reportes/profesores/sucursales?startDate=${startDate}&endDate=${endDate}&sucursalId=all`);
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las sucursales');
                if (isMounted) setBranches(result.data || []);
            } catch (err: any) {
                if (isMounted) setErrorBranches(err.message || 'Error desconocido');
            } finally {
                if (isMounted) setLoadingBranches(false);
            }
        };

        fetchBranches();
        return () => { isMounted = false; };
    }, [startDate, endDate]);

    useEffect(() => {
        if (!selectedSucursal) {
            setProfesores([]);
            setSelectedProfesor(null);
            setArticulos([]);
            setSelectedArticleForSales(null);
            setArticleSales([]);
            setSelectedVenta(null);
            return;
        }

        let isMounted = true;
        const fetchProfesores = async () => {
            setLoadingProfesores(true);
            setErrorProfesores(null);
            setProfesores([]);
            setSelectedProfesor(null);
            setArticulos([]);
            setSelectedArticleForSales(null);
            setArticleSales([]);
            setSelectedVenta(null);

            try {
                const response = await fetch(`/api/reportes/profesores?startDate=${startDate}&endDate=${endDate}&sucursalId=${selectedSucursal.IdSucursal}`);
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'No se pudieron cargar los profesores');
                if (isMounted) setProfesores(result.data || []);
            } catch (err: any) {
                if (isMounted) setErrorProfesores(err.message || 'Error desconocido');
            } finally {
                if (isMounted) setLoadingProfesores(false);
            }
        };

        fetchProfesores();
        return () => { isMounted = false; };
    }, [selectedSucursal, startDate, endDate]);

    useEffect(() => {
        if (!selectedProfesor) {
            setArticulos([]);
            setSelectedArticleForSales(null);
            setArticleSales([]);
            setSelectedVenta(null);
            return;
        }

        let isMounted = true;
        const fetchArticulos = async () => {
            setLoadingArticulos(true);
            setErrorArticulos(null);
            setArticulos([]);
            setSelectedArticleForSales(null);
            setArticleSales([]);
            setSelectedVenta(null);

            try {
                const response = await fetch(`/api/reportes/profesores/articulos?startDate=${startDate}&endDate=${endDate}&idSocio=${selectedProfesor.IdSocio}&sucursalId=${selectedSucursal?.IdSucursal || 'all'}`);
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'No se pudieron cargar los artículos');
                if (isMounted) setArticulos(result.data || []);
            } catch (err: any) {
                if (isMounted) setErrorArticulos(err.message || 'Error desconocido');
            } finally {
                if (isMounted) setLoadingArticulos(false);
            }
        };

        fetchArticulos();
        return () => { isMounted = false; };
    }, [selectedProfesor, selectedSucursal, startDate, endDate]);

    useEffect(() => {
        if (!isArticleSalesModalOpen || !selectedArticleForSales || !selectedProfesor) {
            return;
        }

        let isMounted = true;
        const fetchArticleSales = async () => {
            setLoadingArticleSales(true);
            setErrorArticleSales(null);
            setArticleSales([]);

            try {
                const response = await fetch(`/api/reportes/profesores/ventas?startDate=${startDate}&endDate=${endDate}&idSocio=${selectedProfesor.IdSocio}&idArticulo=${selectedArticleForSales.IdArticulo}&sucursalId=${selectedSucursal?.IdSucursal || 'all'}`);
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las ventas del artículo');
                if (isMounted) setArticleSales(result.data || []);
            } catch (err: any) {
                if (isMounted) setErrorArticleSales(err.message || 'Error desconocido');
            } finally {
                if (isMounted) setLoadingArticleSales(false);
            }
        };

        fetchArticleSales();
        return () => { isMounted = false; };
    }, [isArticleSalesModalOpen, selectedArticleForSales, selectedProfesor, selectedSucursal, startDate, endDate]);

    useEffect(() => {
        if (!initialSucursalId) return;

        if (initialSucursalId === 'all' && branches.length > 0) {
            const totalBranch = {
                IdSucursal: 'all',
                Nombre: 'Todas las Sucursales',
                TotalVenta: branches.reduce((sum, branch) => sum + Number(branch.TotalVenta || 0), 0),
                TotalClientes: branches.reduce((sum, branch) => sum + Number(branch.TotalClientes || 0), 0),
            };
            setSelectedSucursal(totalBranch);
            return;
        }

        const branch = branches.find((branch) => String(branch.IdSucursal) === initialSucursalId);
        if (branch) setSelectedSucursal(branch);
    }, [initialSucursalId, branches, selectedSucursal]);

    useEffect(() => {
        if (!selectedSucursal || !initialProfesorId || selectedProfesor) return;
        const professor = profesores.find((prof) => String(prof.IdSocio) === initialProfesorId);
        if (professor) setSelectedProfesor(professor);
    }, [selectedSucursal, profesores, initialProfesorId, selectedProfesor]);

    const handleParamChange = (key: string, value: string) => {
        const nextParams = new URLSearchParams(window.location.search);
        if (value) nextParams.set(key, value);
        else nextParams.delete(key);
        router.push(`?${nextParams.toString()}`);

        if (key === 'startDate') setStartDate(value || getFirstOfMonth());
        if (key === 'endDate') setEndDate(value || getToday());
    };

    const formatCurrency = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return val;
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
    };

    const clearSucursalSelection = () => {
        setSelectedSucursal(null);
        setSelectedProfesor(null);
        setSelectedArticleForSales(null);
        setArticleSales([]);
        setSelectedVenta(null);
        updateQueryParams({ sucursalId: null, profesorId: null, articuloId: null });
    };

    const clearProfesorSelection = () => {
        setSelectedProfesor(null);
        setSelectedArticleForSales(null);
        setArticleSales([]);
        setSelectedVenta(null);
        updateQueryParams({ profesorId: null, articuloId: null });
    };

    const clearArticleSelection = () => {
        setSelectedArticleForSales(null);
        setArticleSales([]);
        setSelectedVenta(null);
        updateQueryParams({ articuloId: null });
    };

    const allBranchesTotal = useMemo(() => {
        if (branches.length === 0) return null;
        return {
            IdSucursal: 'all',
            Nombre: 'Todas las Sucursales',
            TotalVenta: branches.reduce((sum, branch) => sum + Number(branch.TotalVenta || 0), 0),
            TotalClientes: branches.reduce((sum, branch) => sum + Number(branch.TotalClientes || 0), 0),
        };
    }, [branches]);

    return (
        <div className="space-y-6 pb-12">
            {/* Header with Filters & Periods */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white py-4 px-6 rounded-2xl shadow-sm border border-slate-100 animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3 select-none">
                        <Store className="text-blue-600" />
                        Profesores Global
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
                        disabled={loadingBranches || loadingProfesores || loadingArticulos}
                        title="Actualizar Datos"
                    >
                        <RefreshCcw size={16} className={cn((loadingBranches || loadingProfesores || loadingArticulos) && "animate-spin")} />
                    </button>
                </div>
            </div>

            {!selectedSucursal && (
                <section className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-semibold text-slate-900">Sucursales</h2>
                            <p className="text-sm text-slate-500">Haz clic en una sucursal para ver profesores por sucursal.</p>
                        </div>
                    </div>

                    {loadingBranches ? (
                    <div className="flex items-center justify-center h-48 rounded-3xl bg-white border border-slate-200">
                        <Loader2 className="animate-spin text-blue-600" size={28} />
                    </div>
                ) : errorBranches ? (
                    <div className="rounded-3xl bg-red-50 border border-red-200 text-red-700 p-6">{errorBranches}</div>
                ) : (
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                        {allBranchesTotal && (() => {
                            const theme = getCardTheme(0);
                            const isSelected = (selectedSucursal as any)?.IdSucursal === 'all';
                            return (
                                <div
                                    onClick={() => handleSucursalSelect(allBranchesTotal)}
                                    className={cn(
                                        'cursor-pointer rounded-xl border p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg relative overflow-hidden group select-none flex flex-col justify-between min-h-[140px]',
                                        isSelected ? theme.selectedBg : `bg-white ${theme.border} ${theme.bg}`
                                    )}
                                >
                                    {/* Top-Right Soft Decorative Radial Gradient */}
                                    <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-bl-full pointer-events-none transition-transform duration-500 group-hover:scale-110"></div>
                                    
                                    {/* Left color bar indicator */}
                                    <div className={cn("absolute left-0 top-0 bottom-0 w-1 transition-colors duration-300", isSelected ? "bg-gradient-to-b from-indigo-600 to-purple-600" : "bg-slate-200 group-hover:bg-indigo-500")}></div>

                                    <div>
                                        <div className="flex items-center justify-between gap-2 mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 shadow-xs", theme.iconContainer)}>
                                                    <LayoutGrid size={16} />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-extrabold text-slate-800 truncate max-w-[120px] tracking-tight">{allBranchesTotal.Nombre}</h3>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Global</p>
                                                </div>
                                            </div>
                                            <div className={cn("transition-all duration-300 transform group-hover:translate-x-0.5", theme.arrowColor)}>
                                                <ArrowRight size={14} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2 mt-auto pt-2 border-t border-slate-100/80">
                                        <div className="flex items-baseline justify-between gap-1">
                                            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Venta Global</span>
                                            <span className={cn("text-base font-black tracking-tight", theme.accentText)}>
                                                {formatCurrency(allBranchesTotal.TotalVenta)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-[11px]">
                                            <span className="text-slate-400 font-semibold">Clientes Totales</span>
                                            <span className={cn("font-bold text-[10px] px-2 py-0.25 rounded-full", theme.pillBg)}>
                                                {allBranchesTotal.TotalClientes}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {branches.map((branch, idx) => {
                            const theme = getCardTheme(idx + 1);
                            const isSelected = (selectedSucursal as any)?.IdSucursal === branch.IdSucursal;
                            return (
                                <div
                                    key={branch.IdSucursal}
                                    onClick={() => handleSucursalSelect(branch)}
                                    className={cn(
                                        'cursor-pointer rounded-xl border p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg relative overflow-hidden group select-none flex flex-col justify-between min-h-[140px]',
                                        isSelected ? theme.selectedBg : `bg-white ${theme.border} ${theme.bg}`
                                    )}
                                >
                                    {/* Top-Right Soft Decorative Radial Gradient */}
                                    <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-current opacity-[0.04] rounded-bl-full pointer-events-none transition-transform duration-500 group-hover:scale-110"></div>
                                    
                                    {/* Left color bar indicator */}
                                    <div className={cn("absolute left-0 top-0 bottom-0 w-1 transition-colors duration-300", isSelected ? "bg-gradient-to-b from-blue-600 to-indigo-600" : "bg-slate-200 group-hover:bg-blue-500")}></div>

                                    <div>
                                        <div className="flex items-center justify-between gap-2 mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 shadow-xs", theme.iconContainer)}>
                                                    <Store size={16} />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-extrabold text-slate-800 truncate max-w-[120px] tracking-tight">{branch.Nombre}</h3>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sucursal</p>
                                                </div>
                                            </div>
                                            <div className={cn("transition-all duration-300 transform group-hover:translate-x-0.5", theme.arrowColor)}>
                                                <ArrowRight size={14} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2 mt-auto pt-2 border-t border-slate-100/80">
                                        <div className="flex items-baseline justify-between gap-1">
                                            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Venta Total</span>
                                            <span className={cn("text-base font-black tracking-tight", theme.accentText)}>
                                                {formatCurrency(branch.TotalVenta)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-[11px]">
                                            <span className="text-slate-400 font-semibold">Clientes Activos</span>
                                            <span className={cn("font-bold text-[10px] px-2 py-0.25 rounded-full", theme.pillBg)}>
                                                {branch.TotalClientes}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                </section>
            )}

            {selectedSucursal && !selectedProfesor && (
                <section className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-semibold text-slate-900">Profesores en {selectedSucursal.Nombre}</h2>
                            <p className="text-sm text-slate-500">Haz clic en un profesor para ver los artículos que vendió.</p>
                        </div>
                        <button
                            onClick={clearSucursalSelection}
                            className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
                        >
                            Regresar a sucursales
                        </button>
                    </div>

                    {loadingProfesores ? (
                        <div className="flex items-center justify-center h-48 rounded-3xl bg-white border border-slate-200">
                            <Loader2 className="animate-spin text-blue-600" size={28} />
                        </div>
                    ) : errorProfesores ? (
                        <div className="rounded-3xl bg-red-50 border border-red-200 text-red-700 p-6">{errorProfesores}</div>
                    ) : profesores.length === 0 ? (
                        <div className="rounded-3xl bg-slate-50 border border-slate-200 text-slate-500 p-6">No se encontraron profesores para esta sucursal.</div>
                    ) : (
                        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                            {profesores.map((prof, idx) => {
                                const theme = getCardTheme(idx + 2); // Rotate colors beautifully
                                const isSelected = (selectedProfesor as any)?.IdSocio === prof.IdSocio;
                                return (
                                    <div
                                        key={prof.IdSocio}
                                        onClick={() => handleProfesorSelect(prof)}
                                        className={cn(
                                            'cursor-pointer rounded-xl border p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg relative overflow-hidden group select-none flex flex-col justify-between min-h-[140px]',
                                            isSelected ? theme.selectedBg : `bg-white ${theme.border} ${theme.bg}`
                                        )}
                                    >
                                        {/* Top-Right Soft Decorative Radial Gradient */}
                                        <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-current opacity-[0.04] rounded-bl-full pointer-events-none transition-transform duration-500 group-hover:scale-110"></div>
                                        
                                        {/* Left color bar indicator */}
                                        <div className={cn("absolute left-0 top-0 bottom-0 w-1 transition-colors duration-300", isSelected ? "bg-gradient-to-b from-emerald-600 to-teal-600" : "bg-slate-200 group-hover:bg-emerald-500")}></div>

                                        <div>
                                            <div className="flex items-center justify-between gap-2 mb-3">
                                                <div className="flex items-center gap-2">
                                                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 shadow-xs", theme.iconContainer)}>
                                                        <Users size={16} />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-sm font-extrabold text-slate-800 truncate max-w-[120px] tracking-tight">{prof.Cliente}</h3>
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Profesor</p>
                                                    </div>
                                                </div>
                                                <div className={cn("transition-all duration-300 transform group-hover:translate-x-0.5", theme.arrowColor)}>
                                                    <ArrowRight size={14} />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2 mt-auto pt-2 border-t border-slate-100/80">
                                            <div className="flex items-baseline justify-between gap-1">
                                                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Venta Acumulada</span>
                                                <span className={cn("text-base font-black tracking-tight", theme.accentText)}>
                                                    {formatCurrency(prof.ImporteTotal)}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-1 text-[11px] pt-0.5 border-t border-dashed border-slate-100">
                                                <div className="flex justify-between pr-1 border-r border-slate-100">
                                                    <span className="text-slate-400 font-semibold">Tickets</span>
                                                    <span className="font-bold text-slate-700">{prof.TotalVentas}</span>
                                                </div>
                                                <div className="flex justify-between pl-1">
                                                    <span className="text-slate-400 font-semibold">T. Prom</span>
                                                    <span className="font-bold text-slate-700 truncate max-w-[50px]">{formatCurrency(prof.TicketPromedio)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {selectedProfesor && (
                <section className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-semibold text-slate-900">Artículos de {selectedProfesor.Cliente}</h2>
                            <p className="text-sm text-slate-500">Selecciona un artículo para ver el detalle de ventas.</p>
                        </div>
                        <button
                            onClick={clearProfesorSelection}
                            className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
                        >
                            Volver a profesores
                        </button>
                    </div>

                    {loadingArticulos ? (
                        <div className="flex items-center justify-center h-48 rounded-3xl bg-white border border-slate-200">
                            <Loader2 className="animate-spin text-blue-600" size={28} />
                        </div>
                    ) : errorArticulos ? (
                        <div className="rounded-3xl bg-red-50 border border-red-200 text-red-700 p-6">{errorArticulos}</div>
                    ) : articulos.length === 0 ? (
                        <div className="rounded-3xl bg-slate-50 border border-slate-200 text-slate-500 p-6">No se encontraron artículos para este profesor.</div>
                    ) : (
                        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                            {articulos.map((art) => (
                                <div
                                    key={art.IdArticulo}
                                    onClick={() => handleArticleSelect(art)}
                                    className={cn(
                                        'cursor-pointer rounded-xl border border-slate-200/60 p-3.5 shadow-xs border-l-[3px] hover-premium transition-all duration-200 bg-white flex flex-col justify-between min-h-[135px]',
                                        selectedArticleForSales?.IdArticulo === art.IdArticulo ? 'bg-amber-50/20 border-l-amber-600' : 'border-l-amber-500 hover:border-l-amber-600'
                                    )}
                                >
                                    <div>
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <div className="bg-amber-500/10 w-7 h-7 rounded-md flex items-center justify-center text-amber-600 border border-amber-500/20 shrink-0">
                                                    <FileText size={14} />
                                                </div>
                                                <h3 className="text-xs font-extrabold text-slate-800 truncate tracking-tight min-w-0" title={art.Articulo}>{art.Articulo}</h3>
                                            </div>
                                            <div className="text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0"><ArrowRight size={14} /></div>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5 text-[11px] text-slate-500 pt-2 border-t border-slate-100 mt-auto">
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-slate-400">Cantidad / Total</span>
                                            <span className="font-bold text-slate-800">{art.Cantidad} · {formatCurrency(art.Total)}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-slate-400">Tickets / Promedio</span>
                                            <span className="font-bold text-slate-850">{art.NumeroTickets} · {formatCurrency(art.TicketPromedio)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {isArticleSalesModalOpen && selectedArticleForSales && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-5 bg-slate-50">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">Ventas del artículo</h2>
                                <p className="text-sm text-slate-500">{selectedArticleForSales.Articulo} · {selectedProfesor?.Cliente} · {selectedSucursal?.Nombre || 'Todas las sucursales'}</p>
                            </div>
                            <button
                                onClick={() => {
                                    setIsArticleSalesModalOpen(false);
                                    setSelectedArticleForSales(null);
                                    updateQueryParams({ articuloId: null });
                                }}
                                className="text-slate-500 hover:text-slate-900 transition-colors"
                            >
                                Cerrar
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-6">
                            {loadingArticleSales ? (
                                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                                    <Loader2 className="animate-spin mb-4 text-blue-600" size={28} />
                                    <p>Cargando ventas del artículo...</p>
                                </div>
                            ) : errorArticleSales ? (
                                <div className="rounded-3xl bg-red-50 border border-red-200 text-red-700 p-6">{errorArticleSales}</div>
                            ) : articleSales.length === 0 ? (
                                <div className="rounded-3xl bg-slate-50 border border-slate-200 text-slate-500 p-6">No se encontraron ventas para este artículo.</div>
                            ) : (
                                <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                                    <table className="min-w-full text-left text-sm">
                                        <thead className="bg-slate-50 text-slate-500 uppercase tracking-[0.2em] text-[11px]">
                                            <tr>
                                                <th className="px-4 py-4">Folio</th>
                                                <th className="px-4 py-4">Fecha</th>
                                                <th className="px-4 py-4">Sucursal</th>
                                                <th className="px-4 py-4 text-right">Cantidad</th>
                                                <th className="px-4 py-4 text-right">Total Art.</th>
                                                <th className="px-4 py-4 text-right">Total Venta</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {articleSales.map((venta) => (
                                                <tr
                                                    key={`${venta.IdVenta}-${venta.IdSucursal}`}
                                                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                                                    onClick={() => {
                                                        setSelectedVenta(venta);
                                                    }}
                                                >
                                                    <td className="px-4 py-4 font-medium text-slate-900">{venta.Folio}</td>
                                                    <td className="px-4 py-4 text-slate-600">{venta.Fecha}</td>
                                                    <td className="px-4 py-4 text-slate-600">{venta.Sucursal}</td>
                                                    <td className="px-4 py-4 text-right text-slate-900">{venta.CantidadArticulo}</td>
                                                    <td className="px-4 py-4 text-right text-slate-900">{formatCurrency(venta.TotalArticulo)}</td>
                                                    <td className="px-4 py-4 text-right text-slate-900">{formatCurrency(venta.TotalVenta)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <VentasItemDetailModal
                isOpen={selectedVenta !== null}
                onClose={() => {
                    setSelectedVenta(null);
                    if (selectedArticleForSales) setIsArticleSalesModalOpen(true);
                }}
                idVenta={selectedVenta?.IdVenta || null}
                idSucursal={selectedVenta?.IdSucursal || null}
                folioVenta={selectedVenta?.Folio || ''}
                clienteName={selectedProfesor?.Cliente || ''}
            />
        </div>
    );
}
