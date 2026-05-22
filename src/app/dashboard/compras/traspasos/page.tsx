'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    X,
    FileSpreadsheet,
    Loader2,
    Store,
    ArrowUpDown,
    Calendar,
    Filter,
    ChevronDown,
    ArrowRightLeft,
    DollarSign,
    CheckCircle,
    Clock,
    Eye,
    Package,
    ArrowRight,
    RefreshCcw,
    Ban,
    Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import DatePresets from '@/components/DatePresets';

type StatusKey = 'PAGADO' | 'RECIBIDA' | 'PENDIENTE' | 'CANCELADO';

function getStatusKey(row: any): StatusKey {
    if (row.Status !== 0) return 'CANCELADO';
    if ((row.IdUsuarioPago || 0) > 0) return 'PAGADO';
    if ((row.IdUsuarioRecibo || 0) > 0) return 'RECIBIDA';
    return 'PENDIENTE';
}

const STATUS_STYLES: Record<StatusKey, { bg: string; text: string; border: string; dot: string; label: string }> = {
    PAGADO: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100', dot: 'bg-emerald-500', label: 'Pagado' },
    RECIBIDA: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-100', dot: 'bg-indigo-500', label: 'Recibida' },
    PENDIENTE: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100', dot: 'bg-amber-500', label: 'Pendiente' },
    CANCELADO: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-100', dot: 'bg-red-500', label: 'Cancelado' },
};

function TraspasosContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [sucursales, setSucursales] = useState<{ id: number; name: string }[]>([]);
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filters from URL
    const startDate = searchParams.get('startDate') || getFirstOfMonth();
    const endDate = searchParams.get('endDate') || getToday();
    const idTienda = searchParams.get('idTienda') || 'all';
    const statusTab = searchParams.get('status') || 'all';

    // Table States
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [filters, setFilters] = useState<Record<string, string>>({});
    const [searchQuery, setSearchQuery] = useState('');

    // Detail Modal State
    const [selectedTraspaso, setSelectedTraspaso] = useState<any | null>(null);
    const [detailItems, setDetailItems] = useState<any[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

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

    // Fetch Branches
    useEffect(() => {
        const fetchSucursales = async () => {
            try {
                const response = await fetch('/api/sucursales');
                const result = await response.json();
                if (result.success) {
                    setSucursales(result.data);
                }
            } catch (err) {
                console.error('Error fetching sucursales:', err);
            }
        };
        fetchSucursales();
    }, []);

    // Fetch Traspasos
    useEffect(() => {
        let isMounted = true;
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const url = `/api/compras/traspasos?startDate=${startDate}&endDate=${endDate}&idTienda=${idTienda}&status=${statusTab}`;
                const response = await fetch(url);
                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Error al obtener traspasos');
                }

                if (isMounted) {
                    setData(result || []);
                }
            } catch (err: any) {
                if (isMounted) setError(err.message);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData();
        return () => { isMounted = false; };
    }, [startDate, endDate, idTienda, statusTab]);

    // Fetch traspaso details when selected
    useEffect(() => {
        if (!selectedTraspaso) {
            setDetailItems([]);
            return;
        }

        let isMounted = true;
        const fetchDetails = async () => {
            setDetailLoading(true);
            setDetailError(null);
            try {
                const url = `/api/compras/traspasos/details?idTraspaso=${selectedTraspaso.IdTraspaso}`;
                const response = await fetch(url);
                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Error al obtener detalles');
                }

                if (isMounted) {
                    setDetailItems(result || []);
                }
            } catch (err: any) {
                if (isMounted) setDetailError(err.message);
            } finally {
                if (isMounted) setDetailLoading(false);
            }
        };

        fetchDetails();
        return () => { isMounted = false; };
    }, [selectedTraspaso]);

    const handleParamChange = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set(key, value);
        else params.delete(key);
        router.push(`?${params.toString()}`, { scroll: false });
    };

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    // KPI Calculations
    const kpis = useMemo(() => {
        const totalTraspasos = data.length;
        const totalAmount = data.reduce((acc, row) => acc + (Number(row.Total) || 0), 0);
        let pendientes = 0;
        let recibidos = 0;
        let pagados = 0;
        let cancelados = 0;
        data.forEach(row => {
            const k = getStatusKey(row);
            if (k === 'PENDIENTE') pendientes++;
            else if (k === 'RECIBIDA') recibidos++;
            else if (k === 'PAGADO') pagados++;
            else if (k === 'CANCELADO') cancelados++;
        });
        return { totalTraspasos, totalAmount, pendientes, recibidos, pagados, cancelados };
    }, [data]);

    const sortedAndFilteredData = useMemo(() => {
        let result = data;

        // Global search across # orden, # traspaso, sucursal y proveedor
        const q = searchQuery.trim().toLowerCase();
        if (q) {
            result = result.filter(item => {
                const fields = [
                    String(item.IdTraspaso || ''),
                    String(item.IdOrdenCompra || ''),
                    String(item.OrdenCompraStr || ''),
                    String(item.SucursalOrigen || ''),
                    String(item.SucursalDestino || ''),
                    String(item.Proveedor || '')
                ];
                return fields.some(v => v.toLowerCase().includes(q));
            });
        }

        Object.keys(filters).forEach(key => {
            const searchTerm = filters[key].toLowerCase();
            if (searchTerm) {
                result = result.filter(item => {
                    const rowValue = item[key];
                    if (rowValue === null || rowValue === undefined) return false;
                    return String(rowValue).toLowerCase().includes(searchTerm);
                });
            }
        });

        if (sortConfig !== null) {
            result = [...result].sort((a, b) => {
                const valA = a[sortConfig.key];
                const valB = b[sortConfig.key];
                if (valA === null || valA === undefined) return 1;
                if (valB === null || valB === undefined) return -1;
                if (sortConfig.key === 'FechaTraspaso' || sortConfig.key === 'FechaRecibo') {
                    const timeA = new Date(valA).getTime();
                    const timeB = new Date(valB).getTime();
                    return sortConfig.direction === 'asc' ? timeA - timeB : timeB - timeA;
                }
                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [data, filters, sortConfig, searchQuery]);

    const handleExportExcel = () => {
        if (sortedAndFilteredData.length === 0) return;
        const exportData = sortedAndFilteredData.map(row => ({
            ID: row.IdTraspaso,
            SucursalOrigen: row.SucursalOrigen,
            SucursalDestino: row.SucursalDestino,
            Proveedor: row.Proveedor || '',
            Fecha: new Date(row.FechaTraspaso).toLocaleString('es-MX'),
            Productos: row.CantProductos,
            Total: row.Total,
            Usuario: row.UsuarioTraspaso,
            OrdenCompra: row.OrdenCompraStr || '',
            Estatus: row.StatusDescripcion
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Traspasos");
        const selectedSucursal = sucursales.find(s => s.id.toString() === idTienda)?.name || 'Todas';
        const safeName = selectedSucursal.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        XLSX.writeFile(workbook, `Traspasos_${safeName}_${startDate}_al_${endDate}.xlsx`);
    };

    const formatCurrency = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return val;
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
    };

    const formatDate = (val: string | null) => {
        if (!val) return '-';
        return new Date(val).toLocaleDateString('es-MX', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const visibleCols = [
        { key: 'IdTraspaso', label: 'ID' },
        { key: 'SucursalOrigen', label: 'Origen' },
        { key: 'SucursalDestino', label: 'Destino' },
        { key: 'Proveedor', label: 'Proveedor' },
        { key: 'FechaTraspaso', label: 'Fecha' },
        { key: 'CantProductos', label: 'Arts' },
        { key: 'Total', label: 'Total' },
        { key: 'UsuarioTraspaso', label: 'Usuario' },
        { key: 'OrdenCompraStr', label: 'Orden Compra' },
        { key: 'StatusDescripcion', label: 'Estado' }
    ];

    const selectedStatus = selectedTraspaso ? getStatusKey(selectedTraspaso) : null;

    return (
        <div className="space-y-6 relative min-h-[calc(100vh-140px)]">
            {/* Header */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white py-4 px-6 rounded-2xl shadow-sm border border-slate-100 animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3 select-none">
                        <ArrowRightLeft className="text-blue-600" />
                        Traspasos
                    </h1>

                    <DatePresets />
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
                            handleParamChange('startDate', startDate);
                        }}
                        className="p-2.5 bg-slate-50 border border-slate-200 text-blue-600 hover:bg-slate-100 hover:border-slate-300 transition-all rounded-xl shadow-sm cursor-pointer"
                        disabled={loading}
                        title="Actualizar Datos"
                    >
                        <RefreshCcw size={16} className={cn(loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                        <ArrowRightLeft size={22} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Traspasos</p>
                        <h3 className="text-2xl font-black text-slate-950 mt-0.5 tabular-nums">{kpis.totalTraspasos}</h3>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                        <DollarSign size={22} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Importe Total</p>
                        <h3 className="text-2xl font-black text-slate-950 mt-0.5 tabular-nums">{formatCurrency(kpis.totalAmount)}</h3>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                        <Clock size={22} className="animate-pulse" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pendientes</p>
                        <h3 className="text-2xl font-black text-amber-600 mt-0.5 tabular-nums">{kpis.pendientes}</h3>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                        <CheckCircle size={22} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recibidos / Pagados</p>
                        <h3 className="text-2xl font-black text-indigo-600 mt-0.5 tabular-nums">{kpis.recibidos + kpis.pagados}</h3>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center shrink-0">
                        <Ban size={22} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cancelados</p>
                        <h3 className="text-2xl font-black text-red-600 mt-0.5 tabular-nums">{kpis.cancelados}</h3>
                    </div>
                </div>
            </div>

            {/* Filter and Action Panel */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-6">
                    {/* Global Search */}
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all min-w-[260px]">
                        <Search size={14} className="text-slate-400 shrink-0" />
                        <input
                            type="text"
                            placeholder="# Orden, # Traspaso, sucursal o proveedor"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent text-xs font-semibold text-slate-700 placeholder-slate-400 outline-none w-full"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="text-slate-400 hover:text-red-500 transition-colors"
                                title="Limpiar búsqueda"
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>

                    {/* Sucursal Filter */}
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 select-none">
                            <Store size={14} className="text-blue-500" />
                            Sucursal:
                        </span>
                        <div className="relative">
                            <select
                                value={idTienda}
                                onChange={(e) => handleParamChange('idTienda', e.target.value)}
                                className="w-[220px] pl-3 pr-10 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                            >
                                <option value="all">Todas las Sucursales</option>
                                {sucursales.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                        </div>
                    </div>

                    {/* Status Tabs */}
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 select-none">
                            <Filter size={14} className="text-blue-500" />
                            Estatus:
                        </span>
                        <div className="flex bg-slate-100 rounded-xl p-0.5 flex-wrap">
                            {[
                                { id: 'all', label: 'Todos' },
                                { id: 'pending', label: 'Pendientes' },
                                { id: 'received', label: 'Recibidos' },
                                { id: 'paid', label: 'Pagados' },
                                { id: 'cancelled', label: 'Cancelados' }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => handleParamChange('status', tab.id)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                                        statusTab === tab.id
                                            ? "bg-white text-slate-900 shadow-sm"
                                            : "text-slate-500 hover:text-slate-800"
                                    )}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="ml-auto">
                    <button
                        onClick={handleExportExcel}
                        disabled={loading || data.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <FileSpreadsheet size={14} />
                        <span>Exportar Excel</span>
                    </button>
                </div>
            </div>

            {/* Traspasos Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col min-h-[400px]">
                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center h-64 text-slate-500">
                        <Loader2 className="animate-spin mb-4 text-blue-600" size={40} />
                        <p className="font-semibold text-sm">Consultando traspasos...</p>
                    </div>
                ) : error ? (
                    <div className="flex-1 flex flex-col items-center justify-center h-64 text-red-500">
                        <p className="font-bold text-lg">Error de carga</p>
                        <p className="text-sm opacity-80 mt-1">{error}</p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[calc(100vh-380px)]">
                        <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
                            <thead className="bg-slate-50 sticky top-0 shadow-sm z-10 border-b border-slate-200">
                                <tr>
                                    {visibleCols.map(col => (
                                        <th
                                            key={`th-${col.key}`}
                                            className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group text-xs"
                                            onClick={() => handleSort(col.key)}
                                        >
                                            <div className="flex items-center gap-1 justify-between">
                                                {col.label}
                                                <ArrowUpDown size={12} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === col.key && "opacity-100 text-blue-500")} />
                                            </div>
                                        </th>
                                    ))}
                                    <th className="px-5 py-3 text-right text-slate-600 font-bold uppercase tracking-wider text-xs">Acción</th>
                                </tr>
                                <tr className="bg-slate-50/80 backdrop-blur border-b border-slate-200">
                                    {visibleCols.map(col => (
                                        <th key={`filter-${col.key}`} className="px-2 py-1.5 font-normal">
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    placeholder={`Filtrar...`}
                                                    value={filters[col.key] || ''}
                                                    onChange={(e) => handleFilterChange(col.key, e.target.value)}
                                                    className="w-full min-w-[90px] pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 bg-white font-normal"
                                                />
                                                <Filter size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                            </div>
                                        </th>
                                    ))}
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sortedAndFilteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan={visibleCols.length + 1} className="px-5 py-12 text-center text-slate-400 text-sm">
                                            No se encontraron traspasos en este periodo.
                                        </td>
                                    </tr>
                                ) : (
                                    sortedAndFilteredData.map((row, idx) => {
                                        const statusKey = getStatusKey(row);
                                        const s = STATUS_STYLES[statusKey];
                                        return (
                                            <tr
                                                key={idx}
                                                className="hover:bg-blue-50/40 transition-colors group cursor-pointer"
                                                onClick={() => setSelectedTraspaso(row)}
                                            >
                                                <td className="px-5 py-3 font-mono text-blue-600 font-bold text-xs">
                                                    #{row.IdTraspaso}
                                                </td>
                                                <td className="px-5 py-3 text-slate-700 font-semibold text-xs truncate max-w-[160px]">
                                                    {row.SucursalOrigen}
                                                </td>
                                                <td className="px-5 py-3 text-slate-700 font-semibold text-xs truncate max-w-[160px]">
                                                    <div className="flex items-center gap-1.5">
                                                        <ArrowRight size={11} className="text-slate-400 shrink-0" />
                                                        {row.SucursalDestino}
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3 text-slate-600 text-xs truncate max-w-[160px]" title={row.Proveedor || ''}>
                                                    {row.Proveedor || <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-5 py-3 text-slate-600 text-xs">
                                                    {new Date(row.FechaTraspaso).toLocaleDateString('es-MX', {
                                                        day: '2-digit',
                                                        month: 'short',
                                                        year: 'numeric'
                                                    })}
                                                </td>
                                                <td className="px-5 py-3 text-slate-600 text-center text-xs tabular-nums">
                                                    {row.CantProductos}
                                                </td>
                                                <td className="px-5 py-3 text-slate-900 font-bold text-xs text-right tabular-nums">
                                                    {formatCurrency(row.Total)}
                                                </td>
                                                <td className="px-5 py-3 text-slate-600 text-xs">
                                                    {row.UsuarioTraspaso}
                                                </td>
                                                <td className="px-5 py-3 text-xs">
                                                    {row.OrdenCompraStr ? (
                                                        <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                                                            OC-{row.OrdenCompraStr}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-300">—</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3 text-xs">
                                                    <span className={cn(
                                                        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold border",
                                                        s.bg, s.text, s.border
                                                    )}>
                                                        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.dot)}></span>
                                                        <span>{s.label}</span>
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-right">
                                                    <button className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors inline-flex items-center justify-center">
                                                        <Eye size={15} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            {selectedTraspaso && selectedStatus && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
                        {/* Modal Header */}
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-bold px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                                        Traspaso
                                    </span>
                                    {selectedTraspaso.OrdenCompraStr && (
                                        <span className="text-xs font-bold px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded">
                                            Orden Compra #{selectedTraspaso.OrdenCompraStr}
                                        </span>
                                    )}
                                    <span className={cn(
                                        "text-xs font-bold px-2 py-0.5 rounded",
                                        STATUS_STYLES[selectedStatus].bg,
                                        STATUS_STYLES[selectedStatus].text
                                    )}>
                                        {STATUS_STYLES[selectedStatus].label}
                                    </span>
                                </div>
                                <h2 className="text-xl font-black text-slate-900 mt-1 flex items-center gap-2">
                                    ID: <span className="font-mono text-blue-600 font-bold">#{selectedTraspaso.IdTraspaso}</span>
                                </h2>
                            </div>
                            <button
                                onClick={() => setSelectedTraspaso(null)}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Metadata summary */}
                        <div className="p-6 bg-slate-50/30 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-medium text-slate-600">
                            <div>
                                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sucursal Origen</span>
                                <span className="text-slate-900 font-bold text-sm block mt-0.5 truncate">{selectedTraspaso.SucursalOrigen}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sucursal Destino</span>
                                <span className="text-slate-900 font-bold text-sm block mt-0.5 truncate">{selectedTraspaso.SucursalDestino}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fecha Traspaso</span>
                                <span className="text-slate-900 font-bold text-sm block mt-0.5 truncate">{formatDate(selectedTraspaso.FechaTraspaso)}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fecha Recibo</span>
                                <span className="text-slate-900 font-bold text-sm block mt-0.5 truncate">{formatDate(selectedTraspaso.FechaRecibo)}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Capturó</span>
                                <span className="text-slate-900 font-bold text-sm block mt-0.5 truncate">{selectedTraspaso.UsuarioTraspaso}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Productos</span>
                                <span className="text-slate-900 font-bold text-sm block mt-0.5 tabular-nums">{selectedTraspaso.CantProductos}</span>
                            </div>
                            {selectedStatus === 'CANCELADO' && selectedTraspaso.UsuarioCancelacion && (
                                <div className="col-span-2">
                                    <span className="block text-[10px] font-bold text-red-500 uppercase tracking-wider">Cancelado por</span>
                                    <span className="text-red-700 font-bold text-sm block mt-0.5 truncate">{selectedTraspaso.UsuarioCancelacion}</span>
                                </div>
                            )}
                        </div>

                        {/* Items Table */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
                            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                <Package size={16} className="text-slate-500" />
                                Artículos del Traspaso
                            </h4>

                            {detailLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                    <Loader2 className="animate-spin mb-3 text-blue-600" size={32} />
                                    <span className="font-semibold text-xs">Cargando desglose de artículos...</span>
                                </div>
                            ) : detailError ? (
                                <div className="bg-red-50 text-red-700 p-4 rounded-xl text-xs border border-red-100 flex items-center gap-2">
                                    <span>Error al obtener detalle del traspaso: {detailError}</span>
                                </div>
                            ) : detailItems.length === 0 ? (
                                <div className="text-center py-16 text-slate-400 text-xs">
                                    Este traspaso no contiene productos.
                                </div>
                            ) : (
                                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                                            <tr>
                                                <th className="px-4 py-3 font-bold text-slate-600 uppercase w-32">Cód. Barras</th>
                                                <th className="px-4 py-3 font-bold text-slate-600 uppercase">Descripción</th>
                                                <th className="px-4 py-3 font-bold text-slate-600 uppercase text-center w-20">Cant</th>
                                                <th className="px-4 py-3 font-bold text-slate-600 uppercase text-right w-32">Costo</th>
                                                <th className="px-4 py-3 font-bold text-slate-600 uppercase text-right w-32">Subtotal</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {detailItems.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-4 py-3 font-mono text-slate-500">{item.CodigoBarras}</td>
                                                    <td className="px-4 py-3 text-slate-700 font-semibold max-w-[200px] truncate">{item.Descripcion}</td>
                                                    <td className="px-4 py-3 text-slate-700 font-bold text-center tabular-nums">{item.Cantidad}</td>
                                                    <td className="px-4 py-3 text-slate-600 text-right tabular-nums">{formatCurrency(item.Costo)}</td>
                                                    <td className="px-4 py-3 text-slate-900 font-black text-right tabular-nums">{formatCurrency(item.Total)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Footer total */}
                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between font-bold">
                            <div className="text-slate-400 text-xs uppercase tracking-wider">Total del Traspaso</div>
                            <div className="text-2xl font-black text-slate-950 tabular-nums">
                                {formatCurrency(selectedTraspaso.Total)}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function TraspasosDashboardPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin text-blue-600" size={40} />
            </div>
        }>
            <TraspasosContent />
        </Suspense>
    );
}
