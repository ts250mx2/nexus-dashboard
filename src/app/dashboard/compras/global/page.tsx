'use client';

import React, { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    ArrowRight,
    Calendar,
    Loader2,
    Store,
    Package,
    RefreshCcw,
    X,
    Search,
    ChevronRight,
    ShoppingBag,
    ArrowRightLeft,
    CheckCircle,
    Clock,
    LayoutGrid,
    FileText,
    FileSpreadsheet
} from 'lucide-react';
import DatePresetsProfesores from '@/components/DatePresetsProfesores';
import { cn } from '@/lib/utils';
import { buildFormattedSheet, downloadXLSX, safeFileName } from '@/lib/excel-helpers';

interface SucursalKPI {
    IdSucursal: number | string;
    Nombre: string;
    ComprasRecibidas: number;
    ComprasRecibidasMonto: number;
    ComprasPendientes: number;
    ComprasPendientesMonto: number;
    TraspasosRecibidos: number;
    TraspasosRecibidosMonto: number;
    TraspasosPendientes: number;
    TraspasosPendientesMonto: number;
}

interface ArticuloRow {
    IdArticulo: number;
    Codigo: string;
    Articulo: string;
    Cantidad: number;
    Total: number;
    CantCompras: number;
    TotalCompras: number;
    CantTraspasos: number;
    TotalTraspasos: number;
    Recibidos: number;
    Pendientes: number;
}

interface DetalleRow {
    Tipo: 'COMPRA' | 'TRASPASO';
    Id: number;
    Iteracion: number;
    Folio: string;
    Fecha: string;
    FechaRecibo: string | null;
    SucursalDestino: string;
    SucursalOrigen: string | null;
    Origen: string;
    Cantidad: number;
    Costo: number;
    Total: number;
    Estatus: string;
    Creador: string;
    Receptor: string;
}

function getToday() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getFirstOfMonth() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
}

function formatCurrency(val: any) {
    const num = Number(val);
    if (isNaN(num)) return val;
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
}

function formatDate(val: string | null) {
    if (!val) return '—';
    try {
        return new Date(val).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
        return val;
    }
}

const ALL_BRANCH: SucursalKPI = {
    IdSucursal: 'all',
    Nombre: 'Todas las Sucursales',
    ComprasRecibidas: 0,
    ComprasRecibidasMonto: 0,
    ComprasPendientes: 0,
    ComprasPendientesMonto: 0,
    TraspasosRecibidos: 0,
    TraspasosRecibidosMonto: 0,
    TraspasosPendientes: 0,
    TraspasosPendientesMonto: 0
};

function ComprasGlobalContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [startDate, setStartDate] = useState(searchParams.get('startDate') || getFirstOfMonth());
    const [endDate, setEndDate] = useState(searchParams.get('endDate') || getToday());

    const [branches, setBranches] = useState<SucursalKPI[]>([]);
    const [globalKPI, setGlobalKPI] = useState<SucursalKPI | null>(null);
    const [loadingBranches, setLoadingBranches] = useState(false);
    const [errorBranches, setErrorBranches] = useState<string | null>(null);

    const [selectedSucursal, setSelectedSucursal] = useState<SucursalKPI | null>(null);
    const [articulos, setArticulos] = useState<ArticuloRow[]>([]);
    const [loadingArticulos, setLoadingArticulos] = useState(false);
    const [errorArticulos, setErrorArticulos] = useState<string | null>(null);

    const [selectedArticulo, setSelectedArticulo] = useState<ArticuloRow | null>(null);
    const [detalle, setDetalle] = useState<{ compras: DetalleRow[]; traspasos: DetalleRow[] } | null>(null);
    const [loadingDetalle, setLoadingDetalle] = useState(false);
    const [errorDetalle, setErrorDetalle] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState('');

    const updateQueryParams = (updates: Record<string, string | null>) => {
        const next = new URLSearchParams(window.location.search);
        Object.entries(updates).forEach(([k, v]) => {
            if (v === null || v === undefined || v === '') next.delete(k);
            else next.set(k, v);
        });
        router.push(`?${next.toString()}`, { scroll: false });
    };

    const handleDateChange = (key: 'startDate' | 'endDate', value: string) => {
        if (key === 'startDate') setStartDate(value);
        if (key === 'endDate') setEndDate(value);
        updateQueryParams({ [key]: value });
    };

    // Fetch branches KPIs
    useEffect(() => {
        if (!startDate || !endDate) return;
        let isMounted = true;
        const fetchBranches = async () => {
            setLoadingBranches(true);
            setErrorBranches(null);
            try {
                const url = `/api/compras/global/sucursales?startDate=${startDate}&endDate=${endDate}`;
                const res = await fetch(url);
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'No se pudieron cargar las sucursales');
                if (isMounted) {
                    setBranches(json.data || []);
                    setGlobalKPI({ ...ALL_BRANCH, ...json.global });
                }
            } catch (err: any) {
                if (isMounted) setErrorBranches(err.message || 'Error desconocido');
            } finally {
                if (isMounted) setLoadingBranches(false);
            }
        };
        fetchBranches();
        return () => { isMounted = false; };
    }, [startDate, endDate]);

    // Fetch articulos when sucursal is selected
    useEffect(() => {
        if (!selectedSucursal) {
            setArticulos([]);
            setSelectedArticulo(null);
            return;
        }
        let isMounted = true;
        const fetchArticulos = async () => {
            setLoadingArticulos(true);
            setErrorArticulos(null);
            setArticulos([]);
            try {
                const sucursalId = String(selectedSucursal.IdSucursal);
                const url = `/api/compras/global/articulos?startDate=${startDate}&endDate=${endDate}&sucursalId=${sucursalId}`;
                const res = await fetch(url);
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'No se pudieron cargar los artículos');
                if (isMounted) setArticulos(json.data || []);
            } catch (err: any) {
                if (isMounted) setErrorArticulos(err.message || 'Error desconocido');
            } finally {
                if (isMounted) setLoadingArticulos(false);
            }
        };
        fetchArticulos();
        return () => { isMounted = false; };
    }, [selectedSucursal, startDate, endDate]);

    // Fetch detalle when articulo is selected
    useEffect(() => {
        if (!selectedArticulo || !selectedSucursal) {
            setDetalle(null);
            return;
        }
        let isMounted = true;
        const fetchDetalle = async () => {
            setLoadingDetalle(true);
            setErrorDetalle(null);
            setDetalle(null);
            try {
                const sucursalId = String(selectedSucursal.IdSucursal);
                const url = `/api/compras/global/articulo/detalle?idArticulo=${selectedArticulo.IdArticulo}&startDate=${startDate}&endDate=${endDate}&sucursalId=${sucursalId}`;
                const res = await fetch(url);
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'No se pudo cargar el detalle');
                if (isMounted) setDetalle({ compras: json.compras || [], traspasos: json.traspasos || [] });
            } catch (err: any) {
                if (isMounted) setErrorDetalle(err.message || 'Error desconocido');
            } finally {
                if (isMounted) setLoadingDetalle(false);
            }
        };
        fetchDetalle();
        return () => { isMounted = false; };
    }, [selectedArticulo, selectedSucursal, startDate, endDate]);

    const handleSelectSucursal = (s: SucursalKPI) => {
        setSearchTerm('');
        setSelectedSucursal(s);
        setSelectedArticulo(null);
    };

    const clearSucursal = () => {
        setSearchTerm('');
        setSelectedSucursal(null);
        setSelectedArticulo(null);
    };

    const closeDetalle = () => {
        setSelectedArticulo(null);
    };

    const handleExportDetalleExcel = () => {
        if (!selectedArticulo || !selectedSucursal || !detalle) return;

        const meta = [
            { label: 'Artículo:', value: selectedArticulo.Articulo },
            { label: 'Código:', value: selectedArticulo.Codigo || `#${selectedArticulo.IdArticulo}` },
            { label: 'Sucursal:', value: selectedSucursal.Nombre },
            { label: 'Periodo:', value: `${startDate} al ${endDate}` },
            { label: 'Generado:', value: new Date().toLocaleString('es-MX') }
        ];

        const columns = [
            { header: 'Folio', key: 'Folio', width: 14 },
            { header: 'Fecha', key: 'Fecha', width: 14 },
            { header: 'Origen', key: 'Origen', width: 28 },
            { header: 'Sucursal Destino', key: 'SucursalDestino', width: 24 },
            { header: 'Cantidad', key: 'Cantidad', width: 12, isNumber: true, align: 'right' as const },
            { header: 'Costo', key: 'Costo', width: 14, isCurrency: true, align: 'right' as const },
            { header: 'Total', key: 'Total', width: 16, isCurrency: true, align: 'right' as const },
            { header: 'Estatus', key: 'Estatus', width: 14, align: 'center' as const },
            { header: 'Fecha Recibo', key: 'FechaReciboStr', width: 14 },
            { header: 'Creador', key: 'Creador', width: 18 },
            { header: 'Receptor', key: 'Receptor', width: 18 }
        ];

        const toRow = (r: DetalleRow) => ({
            Folio: r.Folio,
            Fecha: r.Fecha ? new Date(r.Fecha).toLocaleDateString('es-MX') : '',
            Origen: r.Origen || '—',
            SucursalDestino: r.SucursalDestino || '—',
            Cantidad: Number(r.Cantidad) || 0,
            Costo: Number(r.Costo) || 0,
            Total: Number(r.Total) || 0,
            Estatus: r.Estatus,
            FechaReciboStr: r.FechaRecibo ? new Date(r.FechaRecibo).toLocaleDateString('es-MX') : '—',
            Creador: r.Creador || '—',
            Receptor: r.Receptor || '—'
        });

        const comprasRows = detalle.compras.map(toRow);
        const traspasosRows = detalle.traspasos.map(toRow);

        const sumCant = (rows: typeof comprasRows) => rows.reduce((acc, r) => acc + r.Cantidad, 0);
        const sumTotal = (rows: typeof comprasRows) => rows.reduce((acc, r) => acc + r.Total, 0);

        const wsCompras = buildFormattedSheet({
            title: `Detalle de Compras — ${selectedArticulo.Articulo}`,
            meta,
            columns,
            rows: comprasRows,
            totalRow: comprasRows.length > 0
                ? { label: 'TOTAL COMPRAS', values: { Cantidad: sumCant(comprasRows), Total: sumTotal(comprasRows) } }
                : undefined
        });

        const wsTraspasos = buildFormattedSheet({
            title: `Detalle de Traspasos — ${selectedArticulo.Articulo}`,
            meta,
            columns,
            rows: traspasosRows,
            totalRow: traspasosRows.length > 0
                ? { label: 'TOTAL TRASPASOS', values: { Cantidad: sumCant(traspasosRows), Total: sumTotal(traspasosRows) } }
                : undefined
        });

        const filename = `Detalle_${safeFileName(selectedArticulo.Articulo)}_${safeFileName(selectedSucursal.Nombre)}_${startDate}_al_${endDate}.xlsx`;
        downloadXLSX(filename, [
            { name: 'Compras', ws: wsCompras },
            { name: 'Traspasos', ws: wsTraspasos }
        ]);
    };

    const filteredBranches = useMemo(() => {
        const q = searchTerm.toLowerCase();
        return branches.filter(b => b.Nombre.toLowerCase().includes(q));
    }, [branches, searchTerm]);

    const showAllBranchesCard = useMemo(() => {
        if (!searchTerm) return true;
        return 'todas las sucursales'.includes(searchTerm.toLowerCase());
    }, [searchTerm]);

    const filteredArticulos = useMemo(() => {
        const q = searchTerm.toLowerCase();
        if (!q) return articulos;
        return articulos.filter(a =>
            a.Articulo.toLowerCase().includes(q) ||
            (a.Codigo && a.Codigo.toLowerCase().includes(q)) ||
            String(a.IdArticulo).includes(q)
        );
    }, [articulos, searchTerm]);

    return (
        <div className="space-y-6 pb-12">
            {/* Header with Filters & Periods */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white py-4 px-6 rounded-2xl shadow-sm border border-slate-100 animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3 select-none">
                        <ShoppingBag className="text-blue-600" />
                        Compras Global
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
                            onChange={(e) => handleDateChange('startDate', e.target.value)}
                            className="bg-transparent text-xs font-bold text-slate-700 outline-none p-0 border-none h-auto w-28 cursor-pointer"
                        />
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                        <Calendar size={16} className="text-blue-500" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Al</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => handleDateChange('endDate', e.target.value)}
                            className="bg-transparent text-xs font-bold text-slate-700 outline-none p-0 border-none h-auto w-28 cursor-pointer"
                        />
                    </div>
                    <button
                        onClick={() => handleDateChange('startDate', startDate)}
                        className="p-2.5 bg-slate-50 border border-slate-200 text-blue-600 hover:bg-slate-100 hover:border-slate-300 transition-all rounded-xl shadow-sm"
                        disabled={loadingBranches || loadingArticulos}
                        title="Actualizar Datos"
                    >
                        <RefreshCcw size={16} className={cn((loadingBranches || loadingArticulos) && 'animate-spin')} />
                    </button>
                </div>
            </div>

            {/* SUCURSALES (default view) */}
            {!selectedSucursal && (
                <section className="space-y-4 animate-in fade-in duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/60 shadow-xs">
                        <div>
                            <h2 className="text-xl font-semibold text-slate-900">Sucursales</h2>
                            <p className="text-sm text-slate-500">Haz clic en una sucursal para ver los artículos abastecidos por compras y traspasos en el periodo.</p>
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
                                    className="p-1 hover:bg-slate-200/60 rounded-full transition-colors text-slate-400 hover:text-slate-700"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    {loadingBranches ? (
                        <div className="flex items-center justify-center h-48 rounded-3xl bg-white border border-slate-200">
                            <Loader2 className="animate-spin text-blue-600" size={28} />
                        </div>
                    ) : errorBranches ? (
                        <div className="rounded-3xl bg-red-50 border border-red-200 text-red-700 p-6">{errorBranches}</div>
                    ) : filteredBranches.length === 0 && !showAllBranchesCard ? (
                        <div className="rounded-3xl bg-slate-50 border border-slate-200 text-slate-500 p-8 text-center">No se encontraron sucursales.</div>
                    ) : (
                        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {showAllBranchesCard && globalKPI && (
                                <SucursalCard kpi={globalKPI} isGlobal onClick={() => handleSelectSucursal(globalKPI)} />
                            )}
                            {filteredBranches.map((b) => (
                                <SucursalCard key={b.IdSucursal} kpi={b} onClick={() => handleSelectSucursal(b)} />
                            ))}
                        </div>
                    )}
                </section>
            )}

            {/* ARTICULOS por sucursal */}
            {selectedSucursal && !selectedArticulo && (
                <section className="space-y-4 animate-in fade-in duration-300">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/60 shadow-xs">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center flex-wrap gap-1.5 text-xs font-bold text-slate-400 select-none">
                                <button
                                    onClick={clearSucursal}
                                    className="hover:text-blue-600 hover:underline transition-colors duration-150"
                                >
                                    Sucursales
                                </button>
                                <ChevronRight size={12} className="text-slate-300" />
                                <span className="text-slate-800 font-extrabold">{selectedSucursal.Nombre}</span>
                            </div>
                            <h2 className="text-lg font-black text-slate-800 tracking-tight uppercase mt-0.5">
                                Artículos abastecidos en {selectedSucursal.Nombre}
                            </h2>
                        </div>
                        <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-500/10 focus-within:border-blue-500 transition-all w-full md:w-64 max-w-sm">
                            <Search size={16} className="text-slate-400 mr-2 shrink-0" />
                            <input
                                type="text"
                                placeholder="Buscar artículo..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-transparent text-xs font-semibold text-slate-700 outline-none p-0 border-none h-auto w-full"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="p-1 hover:bg-slate-200/60 rounded-full transition-colors text-slate-400 hover:text-slate-700"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    {loadingArticulos ? (
                        <div className="flex items-center justify-center h-48 rounded-3xl bg-white border border-slate-200">
                            <Loader2 className="animate-spin text-blue-600" size={28} />
                        </div>
                    ) : errorArticulos ? (
                        <div className="rounded-3xl bg-red-50 border border-red-200 text-red-700 p-6">{errorArticulos}</div>
                    ) : filteredArticulos.length === 0 ? (
                        <div className="rounded-3xl bg-slate-50 border border-slate-200 text-slate-500 p-6">No se encontraron artículos abastecidos en el periodo.</div>
                    ) : (
                        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {filteredArticulos.map((a) => (
                                <ArticuloCard key={a.IdArticulo} articulo={a} onClick={() => setSelectedArticulo(a)} />
                            ))}
                        </div>
                    )}
                </section>
            )}

            {/* DETALLE por artículo (modal) */}
            {selectedArticulo && selectedSucursal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
                        {/* Header */}
                        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between bg-slate-50 gap-4">
                            <div className="flex flex-col gap-1 min-w-0">
                                <div className="flex items-center flex-wrap gap-1.5 text-xs font-bold text-slate-400 select-none">
                                    <button onClick={clearSucursal} className="hover:text-blue-600 hover:underline transition-colors">Sucursales</button>
                                    <ChevronRight size={12} className="text-slate-300" />
                                    <button onClick={closeDetalle} className="hover:text-blue-600 hover:underline transition-colors">{selectedSucursal.Nombre}</button>
                                    <ChevronRight size={12} className="text-slate-300" />
                                    <span className="text-slate-800 font-extrabold truncate">{selectedArticulo.Articulo}</span>
                                </div>
                                <h2 className="text-lg font-black text-slate-900 tracking-tight uppercase flex items-center gap-2">
                                    <Package size={20} className="text-blue-600" />
                                    {selectedArticulo.Articulo}
                                </h2>
                                <p className="text-xs font-semibold text-slate-500">
                                    Código: <span className="font-mono font-bold text-slate-700">{selectedArticulo.Codigo || `#${selectedArticulo.IdArticulo}`}</span>
                                    {' · '}Periodo: {startDate} al {endDate}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={handleExportDetalleExcel}
                                    disabled={loadingDetalle || !detalle || (detalle.compras.length === 0 && detalle.traspasos.length === 0)}
                                    className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                    title="Exportar detalle a Excel"
                                >
                                    <FileSpreadsheet size={14} />
                                    <span className="hidden sm:inline">Exportar Excel</span>
                                </button>
                                <button
                                    onClick={closeDetalle}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-auto p-6 space-y-6 bg-slate-50/40">
                            {loadingDetalle ? (
                                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                                    <Loader2 className="animate-spin mb-3 text-blue-600" size={32} />
                                    <span className="font-semibold text-xs">Cargando detalle...</span>
                                </div>
                            ) : errorDetalle ? (
                                <div className="bg-red-50 text-red-700 p-4 rounded-xl text-xs border border-red-100">{errorDetalle}</div>
                            ) : (
                                <>
                                    {/* Compras */}
                                    <DetalleTable
                                        title="Compras"
                                        icon={<ShoppingBag size={16} className="text-blue-600" />}
                                        rows={detalle?.compras || []}
                                        showOrigin
                                    />
                                    {/* Traspasos */}
                                    <DetalleTable
                                        title="Traspasos"
                                        icon={<ArrowRightLeft size={16} className="text-purple-600" />}
                                        rows={detalle?.traspasos || []}
                                        showOrigin
                                    />
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================== SUCURSAL CARD ==============================

function SucursalCard({ kpi, isGlobal, onClick }: { kpi: SucursalKPI; isGlobal?: boolean; onClick: () => void }) {
    return (
        <div
            onClick={onClick}
            className={cn(
                'cursor-pointer rounded-xl border p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg relative overflow-hidden group select-none bg-white',
                isGlobal ? 'border-indigo-300 bg-gradient-to-br from-indigo-50/60 to-white' : 'border-slate-200/80 hover:border-blue-500/50'
            )}
        >
            <div className={cn(
                'absolute left-0 top-0 bottom-0 w-1 transition-colors duration-300',
                isGlobal ? 'bg-gradient-to-b from-indigo-600 to-purple-600' : 'bg-slate-200 group-hover:bg-blue-500'
            )}></div>

            <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                    <div className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300 shadow-xs shrink-0',
                        isGlobal
                            ? 'bg-gradient-to-tr from-indigo-600 to-purple-500 text-white shadow-lg shadow-indigo-500/20'
                            : 'bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-lg shadow-blue-500/20'
                    )}>
                        {isGlobal ? <LayoutGrid size={16} /> : <Store size={16} />}
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm font-extrabold text-slate-800 truncate tracking-tight">{kpi.Nombre}</h3>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{isGlobal ? 'Global' : 'Sucursal'}</p>
                    </div>
                </div>
                <ArrowRight size={14} className={cn('shrink-0', isGlobal ? 'text-indigo-500' : 'text-blue-500')} />
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3">
                <MiniKPI
                    label="Compras Rec."
                    value={kpi.ComprasRecibidas}
                    sub={formatCurrency(kpi.ComprasRecibidasMonto)}
                    color="emerald"
                    icon={<CheckCircle size={11} />}
                />
                <MiniKPI
                    label="Compras Pend."
                    value={kpi.ComprasPendientes}
                    sub={formatCurrency(kpi.ComprasPendientesMonto)}
                    color="amber"
                    icon={<Clock size={11} />}
                />
                <MiniKPI
                    label="Traspasos Rec."
                    value={kpi.TraspasosRecibidos}
                    sub={formatCurrency(kpi.TraspasosRecibidosMonto)}
                    color="indigo"
                    icon={<CheckCircle size={11} />}
                />
                <MiniKPI
                    label="Traspasos Pend."
                    value={kpi.TraspasosPendientes}
                    sub={formatCurrency(kpi.TraspasosPendientesMonto)}
                    color="rose"
                    icon={<Clock size={11} />}
                />
            </div>
        </div>
    );
}

function MiniKPI({ label, value, sub, color, icon }: {
    label: string;
    value: number;
    sub: string;
    color: 'emerald' | 'amber' | 'indigo' | 'rose';
    icon: React.ReactNode;
}) {
    const colorMap = {
        emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        amber: 'bg-amber-50 text-amber-700 border-amber-100',
        indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
        rose: 'bg-rose-50 text-rose-700 border-rose-100'
    };
    return (
        <div className={cn('rounded-lg border p-2', colorMap[color])}>
            <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider opacity-80">
                {icon}
                <span className="truncate">{label}</span>
            </div>
            <div className="text-lg font-black tabular-nums leading-tight mt-0.5">{value}</div>
            <div className="text-[10px] font-semibold opacity-80 truncate tabular-nums">{sub}</div>
        </div>
    );
}

// ============================== ARTICULO CARD ==============================

function ArticuloCard({ articulo, onClick }: { articulo: ArticuloRow; onClick: () => void }) {
    return (
        <div
            onClick={onClick}
            className="cursor-pointer rounded-xl border border-slate-200/60 p-3.5 shadow-xs border-l-[3px] border-l-amber-500 hover:border-l-amber-600 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 bg-white flex flex-col justify-between min-h-[150px]"
        >
            <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-start gap-1.5 min-w-0">
                        <div className="bg-amber-500/10 w-7 h-7 rounded-md flex items-center justify-center text-amber-600 border border-amber-500/20 shrink-0 mt-0.5">
                            <FileText size={14} />
                        </div>
                        <div className="min-w-0 flex flex-col">
                            <h3 className="text-xs font-extrabold text-slate-800 truncate tracking-tight" title={articulo.Articulo}>{articulo.Articulo}</h3>
                            <span className="text-[10px] text-slate-400 font-bold tracking-wider mt-0.5">Código: #{articulo.Codigo || articulo.IdArticulo}</span>
                        </div>
                    </div>
                    <ArrowRight size={14} className="text-slate-400 shrink-0" />
                </div>
            </div>

            <div className="space-y-1.5 text-[11px] text-slate-500 pt-2 border-t border-slate-100 mt-auto">
                <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-400 flex items-center gap-1">
                        <ShoppingBag size={10} className="text-blue-500" /> Compras
                    </span>
                    <span className="font-bold text-slate-800 tabular-nums">{articulo.CantCompras} · {formatCurrency(articulo.TotalCompras)}</span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-400 flex items-center gap-1">
                        <ArrowRightLeft size={10} className="text-purple-500" /> Traspasos
                    </span>
                    <span className="font-bold text-slate-800 tabular-nums">{articulo.CantTraspasos} · {formatCurrency(articulo.TotalTraspasos)}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <span className="font-semibold text-slate-400">Recibidos / Pendientes</span>
                    <span className="font-bold tabular-nums">
                        <span className="text-emerald-700">{articulo.Recibidos}</span>
                        <span className="text-slate-300 mx-1">/</span>
                        <span className="text-amber-700">{articulo.Pendientes}</span>
                    </span>
                </div>
            </div>
        </div>
    );
}

// ============================== DETALLE TABLE ==============================

function DetalleTable({ title, icon, rows, showOrigin }: {
    title: string;
    icon: React.ReactNode;
    rows: DetalleRow[];
    showOrigin?: boolean;
}) {
    const totalCant = rows.reduce((acc, r) => acc + (Number(r.Cantidad) || 0), 0);
    const totalMonto = rows.reduce((acc, r) => acc + (Number(r.Total) || 0), 0);

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2">
                    {icon}
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">{title}</h3>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">({rows.length})</span>
                </div>
                <div className="text-xs font-bold text-slate-700 tabular-nums">
                    <span className="text-slate-400 mr-2">Total:</span>
                    {totalCant} · {formatCurrency(totalMonto)}
                </div>
            </div>

            {rows.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">Sin movimientos en el periodo.</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50/60 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-2.5 font-bold text-slate-600 uppercase tracking-wider">Folio</th>
                                <th className="px-4 py-2.5 font-bold text-slate-600 uppercase tracking-wider">Fecha</th>
                                {showOrigin && <th className="px-4 py-2.5 font-bold text-slate-600 uppercase tracking-wider">Origen</th>}
                                <th className="px-4 py-2.5 font-bold text-slate-600 uppercase tracking-wider">Sucursal Destino</th>
                                <th className="px-4 py-2.5 font-bold text-slate-600 uppercase tracking-wider text-right">Cantidad</th>
                                <th className="px-4 py-2.5 font-bold text-slate-600 uppercase tracking-wider text-right">Costo</th>
                                <th className="px-4 py-2.5 font-bold text-slate-600 uppercase tracking-wider text-right">Total</th>
                                <th className="px-4 py-2.5 font-bold text-slate-600 uppercase tracking-wider">Estatus</th>
                                <th className="px-4 py-2.5 font-bold text-slate-600 uppercase tracking-wider">Recibido</th>
                                <th className="px-4 py-2.5 font-bold text-slate-600 uppercase tracking-wider">Creador</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map((r, i) => {
                                const isReceived = r.Estatus.toLowerCase().startsWith('recib');
                                const isCancelled = r.Estatus.toLowerCase().startsWith('cancel');
                                return (
                                    <tr key={`${r.Tipo}-${r.Id}-${r.Iteracion}-${i}`} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-2.5 font-mono text-blue-600 font-bold whitespace-nowrap">{r.Folio}</td>
                                        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{formatDate(r.Fecha)}</td>
                                        {showOrigin && <td className="px-4 py-2.5 text-slate-700 truncate max-w-[180px]" title={r.Origen}>{r.Origen}</td>}
                                        <td className="px-4 py-2.5 text-slate-700 truncate max-w-[160px]">{r.SucursalDestino}</td>
                                        <td className="px-4 py-2.5 text-right text-slate-900 font-bold tabular-nums">{r.Cantidad}</td>
                                        <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{formatCurrency(r.Costo)}</td>
                                        <td className="px-4 py-2.5 text-right text-slate-900 font-bold tabular-nums">{formatCurrency(r.Total)}</td>
                                        <td className="px-4 py-2.5 whitespace-nowrap">
                                            <span className={cn(
                                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] border',
                                                isCancelled
                                                    ? 'bg-slate-50 text-slate-500 border-slate-200'
                                                    : isReceived
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                        : 'bg-amber-50 text-amber-700 border-amber-100'
                                            )}>
                                                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0',
                                                    isCancelled ? 'bg-slate-400' : isReceived ? 'bg-emerald-500' : 'bg-amber-500'
                                                )}></span>
                                                {r.Estatus}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{formatDate(r.FechaRecibo)}</td>
                                        <td className="px-4 py-2.5 text-slate-600 truncate max-w-[120px]">{r.Creador}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default function ComprasGlobalPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin text-blue-600" size={40} />
            </div>
        }>
            <ComprasGlobalContent />
        </Suspense>
    );
}
