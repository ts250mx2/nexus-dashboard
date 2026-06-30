'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    FileText,
    Loader2,
    Store,
    CalendarClock,
    MapPin,
    ArrowUpRight,
    LayoutGrid,
    RefreshCcw,
    Search,
    X,
    UserX
} from 'lucide-react';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ProfesoresUltimaVentaModal from '@/components/ProfesoresUltimaVentaModal';
import VentasItemDetailModal from '@/components/VentasItemDetailModal';

const CARD_THEMES = [
    {
        bg: "bg-gradient-to-br from-blue-500/[0.03] to-indigo-500/[0.03] hover:from-blue-500/[0.08] hover:to-indigo-500/[0.08]",
        border: "border-slate-200/80 hover:border-blue-500/50",
        accentText: "text-blue-700",
        iconContainer: "bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-lg shadow-blue-500/20",
        arrowColor: "text-blue-500",
        pillBg: "bg-blue-50 text-blue-700 border border-blue-100"
    },
    {
        bg: "bg-gradient-to-br from-purple-500/[0.03] to-fuchsia-500/[0.03] hover:from-purple-500/[0.08] hover:to-fuchsia-500/[0.08]",
        border: "border-slate-200/80 hover:border-purple-500/50",
        accentText: "text-purple-700",
        iconContainer: "bg-gradient-to-tr from-purple-600 to-fuchsia-500 text-white shadow-lg shadow-purple-500/20",
        arrowColor: "text-purple-500",
        pillBg: "bg-purple-50 text-purple-700 border border-purple-100"
    },
    {
        bg: "bg-gradient-to-br from-emerald-500/[0.03] to-teal-500/[0.03] hover:from-emerald-500/[0.08] hover:to-teal-500/[0.08]",
        border: "border-slate-200/80 hover:border-emerald-500/50",
        accentText: "text-emerald-700",
        iconContainer: "bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-500/20",
        arrowColor: "text-emerald-500",
        pillBg: "bg-emerald-50 text-emerald-700 border border-emerald-100"
    },
    {
        bg: "bg-gradient-to-br from-amber-500/[0.03] to-orange-500/[0.03] hover:from-amber-500/[0.08] hover:to-orange-500/[0.08]",
        border: "border-slate-200/80 hover:border-amber-500/50",
        accentText: "text-amber-850",
        iconContainer: "bg-gradient-to-tr from-amber-600 to-orange-500 text-white shadow-lg shadow-amber-500/20",
        arrowColor: "text-amber-600",
        pillBg: "bg-amber-50 text-amber-700 border border-amber-100"
    },
    {
        bg: "bg-gradient-to-br from-rose-500/[0.03] to-pink-500/[0.03] hover:from-rose-500/[0.08] hover:to-pink-500/[0.08]",
        border: "border-slate-200/80 hover:border-rose-500/50",
        accentText: "text-rose-700",
        iconContainer: "bg-gradient-to-tr from-rose-600 to-pink-500 text-white shadow-lg shadow-rose-500/20",
        arrowColor: "text-rose-500",
        pillBg: "bg-rose-50 text-rose-700 border border-rose-100"
    },
    {
        bg: "bg-gradient-to-br from-indigo-500/[0.03] to-blue-500/[0.03] hover:from-indigo-500/[0.08] hover:to-blue-500/[0.08]",
        border: "border-slate-200/80 hover:border-indigo-500/50",
        accentText: "text-indigo-700",
        iconContainer: "bg-gradient-to-tr from-indigo-600 to-blue-500 text-white shadow-lg shadow-indigo-500/20",
        arrowColor: "text-indigo-500",
        pillBg: "bg-indigo-50 text-indigo-700 border border-indigo-100"
    },
    {
        bg: "bg-gradient-to-br from-cyan-500/[0.03] to-sky-500/[0.03] hover:from-cyan-500/[0.08] hover:to-sky-500/[0.08]",
        border: "border-slate-200/80 hover:border-cyan-500/50",
        accentText: "text-cyan-700",
        iconContainer: "bg-gradient-to-tr from-cyan-600 to-sky-500 text-white shadow-lg shadow-cyan-500/20",
        arrowColor: "text-cyan-500",
        pillBg: "bg-cyan-50 text-cyan-700 border border-cyan-100"
    }
];

function getCardTheme(idx: number) {
    return CARD_THEMES[idx % CARD_THEMES.length];
}

function formatDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getDefaultCutoff() {
    // Por defecto: 1 de enero del año en curso
    return `${new Date().getFullYear()}-01-01`;
}

const PRESETS: { label: string; months: number }[] = [
    { label: '1 Mes', months: 1 },
    { label: '3 Meses', months: 3 },
    { label: '6 Meses', months: 6 },
    { label: '1 Año', months: 12 },
    { label: '2 Años', months: 24 }
];

function ReportContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [sucursalesSummary, setSucursalesSummary] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const cutoffDate = searchParams.get('cutoffDate') || getDefaultCutoff();

    // Modal stack
    const [isProfesoresModalOpen, setIsProfesoresModalOpen] = useState(false);
    const [selectedSucursal, setSelectedSucursal] = useState<{ id: string | number; name: string } | null>(null);

    const [isVentaModalOpen, setIsVentaModalOpen] = useState(false);
    const [selectedVenta, setSelectedVenta] = useState<{ id: number; folio: string; sucursalId: number; clienteName: string } | null>(null);

    const filteredBranches = useMemo(() => {
        return sucursalesSummary.filter(suc =>
            (suc.Nombre || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [sucursalesSummary, searchTerm]);

    const showAllBranchesCard = useMemo(() => {
        if (!searchTerm) return true;
        return 'todas las sucursales'.includes(searchTerm.toLowerCase());
    }, [searchTerm]);

    useEffect(() => {
        if (!cutoffDate) return;

        let isMounted = true;
        const fetchData = async () => {
            setLoading(true);
            setError(null);

            try {
                const url = `/api/reportes/profesores-ultima-venta/sucursales?cutoffDate=${cutoffDate}`;
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
    }, [cutoffDate]);

    const handleParamChange = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set(key, value);
        else params.delete(key);
        router.push(`?${params.toString()}`, { scroll: false });
    };

    const handlePreset = (months: number) => {
        const d = new Date();
        d.setMonth(d.getMonth() - months);
        handleParamChange('cutoffDate', formatDate(d));
    };

    const formatCurrency = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return val;
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
    };

    const allBranchesSummary = useMemo(() => {
        if (sucursalesSummary.length === 0) return null;
        return {
            IdSucursal: 'all',
            Nombre: 'Todas las Sucursales',
            TotalProfesores: sucursalesSummary.reduce((acc, curr) => acc + Number(curr.TotalProfesores || 0), 0),
            TotalUltimasVentas: sucursalesSummary.reduce((acc, curr) => acc + Number(curr.TotalUltimasVentas || 0), 0)
        };
    }, [sucursalesSummary]);

    const handleExportPDF = async () => {
        setExporting(true);
        try {
            const doc = new jsPDF();

            doc.setFontSize(18);
            doc.setTextColor(30, 41, 59);
            doc.text('Profesores Última Venta por Sucursal', 14, 20);

            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139);
            doc.text(`Última venta anterior a: ${cutoffDate}`, 14, 28);
            doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, 33);

            const headers = [["Sucursal", "Profesores", "Suma Últimas Ventas"]];
            const rows: any[] = [];

            if (allBranchesSummary) {
                rows.push([
                    allBranchesSummary.Nombre,
                    allBranchesSummary.TotalProfesores.toString(),
                    formatCurrency(allBranchesSummary.TotalUltimasVentas)
                ]);
            }

            filteredBranches.forEach((branch) => {
                rows.push([
                    branch.Nombre,
                    Number(branch.TotalProfesores).toString(),
                    formatCurrency(branch.TotalUltimasVentas)
                ]);
            });

            autoTable(doc, {
                head: headers,
                body: rows,
                startY: 41,
                theme: 'striped',
                headStyles: { fillColor: [30, 41, 59] },
                styles: { fontSize: 9.5, cellPadding: 4 },
                columnStyles: {
                    1: { halign: 'right' },
                    2: { halign: 'right' }
                }
            });

            doc.save(`Profesores_Ultima_Venta_Sucursales_antes_de_${cutoffDate}.pdf`);
        } catch (err) {
            console.error("Error exporting PDF:", err);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header with Filters */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white py-4 px-6 rounded-2xl shadow-sm border border-slate-100 animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3 select-none">
                        <UserX className="text-blue-600" />
                        Profesores Última Venta
                    </h1>

                    <div className="flex flex-wrap items-center gap-2">
                        {PRESETS.map((preset) => (
                            <button
                                key={preset.label}
                                onClick={() => handlePreset(preset.months)}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-50 text-slate-600 border border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all active:scale-95"
                                title={`Profesores sin comprar desde hace ${preset.label.toLowerCase()}`}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        <CalendarClock size={16} className="text-amber-500" />
                        <span className="text-[10px] font-bold text-amber-600/80 uppercase">Última venta antes de</span>
                        <input
                            type="date"
                            value={cutoffDate}
                            onChange={(e) => handleParamChange('cutoffDate', e.target.value)}
                            className="bg-transparent text-xs font-bold text-slate-700 outline-none p-0 border-none h-auto w-28 cursor-pointer"
                        />
                    </div>
                    <button
                        onClick={() => handleParamChange('cutoffDate', cutoffDate)}
                        className="p-2.5 bg-slate-50 border border-slate-200 text-blue-600 hover:bg-slate-100 hover:border-slate-300 transition-all rounded-xl shadow-sm"
                        disabled={loading}
                        title="Actualizar Datos"
                    >
                        <RefreshCcw size={16} className={cn(loading && "animate-spin")} />
                    </button>
                    <button
                        onClick={handleExportPDF}
                        disabled={exporting || sucursalesSummary.length === 0}
                        className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 hover:border-rose-300 transition-all rounded-xl shadow-sm text-xs font-bold disabled:opacity-50"
                        title="Exportar Reporte a PDF"
                    >
                        <FileText size={16} className={cn(exporting && "animate-pulse")} />
                        <span className="hidden sm:inline">{exporting ? 'Exportando...' : 'Exportar PDF'}</span>
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
                    <p className="font-medium">No hay profesores con su última venta antes de la fecha indicada.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/60 shadow-xs animate-in fade-in duration-200">
                        <div>
                            <h2 className="text-xl font-semibold text-slate-900">Sucursales</h2>
                            <p className="text-sm text-slate-500">Haz clic en una sucursal para ver los profesores sin ventas recientes.</p>
                        </div>
                        <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-500/10 focus-within:border-blue-500 transition-all w-full sm:w-64 max-w-sm">
                            <Search size={16} className="text-slate-400 mr-2 shrink-0" />
                            <input
                                type="text"
                                placeholder="Buscar sucursal..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-transparent text-xs font-semibold text-slate-700 outline-none p-0 border-none h-auto w-full"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="p-1 hover:bg-slate-200/60 rounded-full transition-colors text-slate-400 hover:text-slate-650"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    {filteredBranches.length === 0 && !showAllBranchesCard ? (
                        <div className="bg-slate-50 border border-slate-200 text-slate-400 p-12 rounded-2xl flex flex-col items-center text-center">
                            <MapPin size={48} className="mb-4 opacity-20" />
                            <p className="font-medium">No se encontraron sucursales que coincidan con su búsqueda.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {/* Special Card: All Branches */}
                            {showAllBranchesCard && allBranchesSummary && (() => {
                                const theme = getCardTheme(0);
                                return (
                                    <div
                                        onClick={() => {
                                            setSelectedSucursal({ id: 'all', name: 'Todas las Sucursales' });
                                            setIsProfesoresModalOpen(true);
                                        }}
                                        className={cn(
                                            'cursor-pointer rounded-xl border p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg relative overflow-hidden group select-none flex flex-col justify-between min-h-[140px]',
                                            `bg-white ${theme.border} ${theme.bg}`
                                        )}
                                    >
                                        <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-bl-full pointer-events-none transition-transform duration-500 group-hover:scale-110"></div>
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
                                                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Profesores</span>
                                                <span className={cn("text-xl font-black tracking-tight", theme.accentText)}>
                                                    {allBranchesSummary.TotalProfesores}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-[11px]">
                                                <span className="text-slate-400 font-semibold">Suma Últ. Ventas</span>
                                                <span className={cn("font-bold text-[10px] px-2 py-0.25 rounded-full", theme.pillBg)}>
                                                    {formatCurrency(allBranchesSummary.TotalUltimasVentas)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Branch Cards */}
                            {filteredBranches.map((suc, idx) => {
                                const theme = getCardTheme(idx + 1);
                                return (
                                    <div
                                        key={suc.IdSucursal}
                                        onClick={() => {
                                            setSelectedSucursal({ id: suc.IdSucursal, name: suc.Nombre });
                                            setIsProfesoresModalOpen(true);
                                        }}
                                        className={cn(
                                            'cursor-pointer rounded-xl border p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg relative overflow-hidden group select-none flex flex-col justify-between min-h-[140px]',
                                            `bg-white ${theme.border} ${theme.bg}`
                                        )}
                                    >
                                        <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-current opacity-[0.04] rounded-bl-full pointer-events-none transition-transform duration-500 group-hover:scale-110"></div>
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
                                                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Profesores</span>
                                                <span className={cn("text-xl font-black tracking-tight", theme.accentText)}>
                                                    {suc.TotalProfesores}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-[11px]">
                                                <span className="text-slate-400 font-semibold">Suma Últ. Ventas</span>
                                                <span className={cn("font-bold text-[10px] px-2 py-0.25 rounded-full", theme.pillBg)}>
                                                    {formatCurrency(suc.TotalUltimasVentas)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* MODAL STACK */}

            {/* Level 1: Profesores in Branch with last sale before cutoff */}
            <ProfesoresUltimaVentaModal
                isOpen={isProfesoresModalOpen}
                onClose={() => setIsProfesoresModalOpen(false)}
                idSucursal={selectedSucursal?.id ?? null}
                sucursalName={selectedSucursal?.name || ''}
                cutoffDate={cutoffDate}
                onSaleClick={(sale) => {
                    setSelectedVenta(sale);
                    setIsVentaModalOpen(true);
                }}
            />

            {/* Level 2: Detail of the last sale (ticket items) */}
            <VentasItemDetailModal
                isOpen={isVentaModalOpen}
                onClose={() => setIsVentaModalOpen(false)}
                idVenta={selectedVenta?.id || null}
                idSucursal={selectedVenta?.sucursalId || null}
                folioVenta={selectedVenta?.folio || ''}
                clienteName={selectedVenta?.clienteName || ''}
            />
        </div>
    );
}

export default function ProfesoresUltimaVentaPage() {
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
