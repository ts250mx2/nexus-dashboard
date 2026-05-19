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
    DollarSign,
    CheckCircle,
    Eye,
    TrendingUp,
    User,
    Layers,
    AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import DatePresets from '@/components/DatePresets';

function RetirosContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [sucursales, setSucursales] = useState<{ id: number; name: string }[]>([]);
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // URL Param Filters
    const startDate = searchParams.get('startDate') || getFirstOfMonth();
    const endDate = searchParams.get('endDate') || getToday();
    const idTienda = searchParams.get('idTienda') || 'all';

    // UI States
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [filters, setFilters] = useState<Record<string, string>>({});
    const [selectedRetiro, setSelectedRetiro] = useState<any | null>(null);

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

    // Fetch Withdrawals
    useEffect(() => {
        let isMounted = true;
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const url = `/api/ventas/retiros?startDate=${startDate}&endDate=${endDate}&idTienda=${idTienda}`;
                const response = await fetch(url);
                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Error al obtener retiros');
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
    }, [startDate, endDate, idTienda]);

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

    // Metrics Calculations
    const kpis = useMemo(() => {
        const totalCount = data.length;
        const totalCash = data.reduce((acc, r) => acc + (r.Efectivo || 0), 0);
        const average = totalCount > 0 ? totalCash / totalCount : 0;

        // Group by branch to find top withdrawing branch
        const branchAmounts: Record<string, number> = {};
        data.forEach(r => {
            branchAmounts[r.Tienda] = (branchAmounts[r.Tienda] || 0) + (r.Efectivo || 0);
        });

        let topBranch = '-';
        let topAmount = 0;
        Object.keys(branchAmounts).forEach(b => {
            if (branchAmounts[b] > topAmount) {
                topAmount = branchAmounts[b];
                topBranch = b;
            }
        });

        return {
            totalCount,
            totalCash,
            average,
            topBranch,
            topAmount
        };
    }, [data]);

    const sortedAndFilteredData = useMemo(() => {
        let result = data;

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
                
                // DateTime comparison
                if (sortConfig.key === 'FechaRetiro') {
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
    }, [data, filters, sortConfig]);

    const handleExportExcel = () => {
        if (sortedAndFilteredData.length === 0) return;
        const exportData = sortedAndFilteredData.map(row => ({
            ID: row.IdRetiro,
            Sucursal: row.Tienda,
            Cajero: row.Cajero,
            Fecha: new Date(row.FechaRetiro).toLocaleString('es-MX'),
            Efectivo: row.Efectivo,
            ID_Apertura: row.IdApertura,
            Estatus: row.Status === 0 ? 'Activo' : 'Cancelado',
            Tipo: row.TipoRetiro === 0 ? 'Parcial' : 'Total'
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Retiros");
        const selectedSucursal = sucursales.find(s => s.id.toString() === idTienda)?.name || 'Todas';
        const safeName = selectedSucursal.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        XLSX.writeFile(workbook, `Retiros_${safeName}_${startDate}_al_${endDate}.xlsx`);
    };

    const formatCurrency = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return val;
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
    };

    const visibleCols = [
        { key: 'IdRetiro', label: 'ID' },
        { key: 'Tienda', label: 'Sucursal' },
        { key: 'Cajero', label: 'Cajero' },
        { key: 'FechaRetiro', label: 'Fecha & Hora' },
        { key: 'Efectivo', label: 'Monto' },
        { key: 'IdApertura', label: 'ID Apertura' },
        { key: 'Status', label: 'Estatus' }
    ];

    return (
        <div className="space-y-6 relative min-h-[calc(100vh-140px)] animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Retiros de Efectivo</h1>
                    <p className="text-slate-500 mt-1">Monitoreo y auditoría de salidas de caja y retiros de efectivo</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExportExcel}
                        disabled={loading || data.length === 0}
                        className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-95 text-sm"
                    >
                        <FileSpreadsheet size={16} />
                        <span>Exportar Excel</span>
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                        <DollarSign size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Retiros</p>
                        <h3 className="text-2xl font-black text-slate-950 mt-0.5 tabular-nums">{kpis.totalCount}</h3>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                    <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center shrink-0">
                        <TrendingUp size={24} className="rotate-180" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Efectivo Retirado</p>
                        <h3 className="text-2xl font-black text-rose-600 mt-0.5 tabular-nums">{formatCurrency(kpis.totalCash)}</h3>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                        <Layers size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Promedio Retiro</p>
                        <h3 className="text-2xl font-black text-blue-600 mt-0.5 tabular-nums">{formatCurrency(kpis.average)}</h3>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                        <Store size={24} />
                    </div>
                    <div className="overflow-hidden">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Top Sucursal</p>
                        <h3 className="text-base font-black text-indigo-950 mt-0.5 truncate" title={kpis.topBranch}>
                            {kpis.topBranch}
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold tabular-nums">{formatCurrency(kpis.topAmount)}</p>
                    </div>
                </div>
            </div>

            {/* Filter Panel */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap items-center justify-between gap-6">
                <div className="flex flex-wrap items-center gap-6">
                    {/* Sucursal Filter */}
                    <div className="flex flex-col gap-1.5 min-w-[200px]">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                            <Store size={14} className="text-amber-500" />
                            Sucursal
                        </div>
                        <div className="relative">
                            <select
                                value={idTienda}
                                onChange={(e) => handleParamChange('idTienda', e.target.value)}
                                className="w-full pl-3 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all appearance-none cursor-pointer"
                            >
                                <option value="all">Todas las Sucursales</option>
                                {sucursales.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                        </div>
                    </div>

                    {/* Periodo de Tiempo */}
                    <div className="flex flex-col gap-1.5 min-w-[300px]">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                            <Calendar size={14} className="text-indigo-500" />
                            Periodo de Tiempo
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Del</span>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => handleParamChange('startDate', e.target.value)}
                                        className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
                                    />
                                </div>
                                <div className="h-4 w-px bg-slate-300"></div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Al</span>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => handleParamChange('endDate', e.target.value)}
                                        className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
                                    />
                                </div>
                            </div>
                            <div className="hidden sm:block w-px h-6 bg-slate-200"></div>
                            <DatePresets />
                        </div>
                    </div>
                </div>
            </div>

            {/* Withdrawals Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col min-h-[400px]">
                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center h-64 text-slate-500">
                        <Loader2 className="animate-spin mb-4 text-amber-600" size={40} />
                        <p className="font-semibold text-sm">Consultando retiros de efectivo...</p>
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
                                                <ArrowUpDown size={12} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === col.key && "opacity-100 text-amber-500")} />
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
                                                    className="w-full min-w-[90px] pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500 bg-white font-normal"
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
                                            No se encontraron retiros registrados en este periodo.
                                        </td>
                                    </tr>
                                ) : (
                                    sortedAndFilteredData.map((row, idx) => {
                                        const isCancelled = row.Status !== 0;
                                        return (
                                            <tr
                                                key={idx}
                                                className="hover:bg-amber-50/20 transition-colors group cursor-pointer"
                                                onClick={() => setSelectedRetiro(row)}
                                            >
                                                <td className="px-5 py-3 font-mono text-slate-800 font-bold text-xs">
                                                    #{row.IdRetiro}
                                                </td>
                                                <td className="px-5 py-3 text-slate-700 font-semibold text-xs truncate max-w-[150px]">
                                                    {row.Tienda}
                                                </td>
                                                <td className="px-5 py-3 text-slate-700 font-semibold text-xs truncate max-w-[200px]">
                                                    {row.Cajero}
                                                </td>
                                                <td className="px-5 py-3 text-slate-600 text-xs">
                                                    {new Date(row.FechaRetiro).toLocaleString('es-MX', {
                                                        day: '2-digit',
                                                        month: 'short',
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </td>
                                                <td className="px-5 py-3 text-rose-600 font-bold text-xs text-right tabular-nums">
                                                    {formatCurrency(row.Efectivo)}
                                                </td>
                                                <td className="px-5 py-3 text-slate-600 text-xs font-mono">
                                                    #{row.IdApertura}
                                                </td>
                                                <td className="px-5 py-3 text-xs">
                                                    <span className={cn(
                                                        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold",
                                                        !isCancelled
                                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                                            : "bg-red-50 text-red-700 border border-red-100"
                                                    )}>
                                                        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", !isCancelled ? "bg-emerald-500" : "bg-red-500")}></span>
                                                        <span>{!isCancelled ? 'Válido' : 'Cancelado'}</span>
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-right">
                                                    <button className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors inline-flex items-center justify-center">
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

            {/* Centered Detail Modal */}
            {selectedRetiro && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
                        {/* Modal Header */}
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                            <div>
                                <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded">
                                    Detalle del Retiro
                                </span>
                                <h2 className="text-xl font-black text-slate-900 mt-1">
                                    Retiro ID: <span className="font-mono text-amber-600 font-bold">#{selectedRetiro.IdRetiro}</span>
                                </h2>
                            </div>
                            <button
                                onClick={() => setSelectedRetiro(null)}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body Info list */}
                        <div className="p-6 space-y-5 bg-white">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sucursal</span>
                                    <span className="text-slate-950 font-bold text-sm block mt-1 truncate">{selectedRetiro.Tienda}</span>
                                </div>
                                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cajero</span>
                                    <span className="text-slate-950 font-bold text-sm block mt-1 truncate">{selectedRetiro.Cajero}</span>
                                </div>
                            </div>

                            <div className="border border-slate-100 rounded-xl p-4 space-y-3.5">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400 font-bold uppercase tracking-wider">Fecha & Hora:</span>
                                    <span className="text-slate-700 font-semibold">
                                        {new Date(selectedRetiro.FechaRetiro).toLocaleString('es-MX')}
                                    </span>
                                </div>

                                <div className="h-px bg-slate-100"></div>

                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400 font-bold uppercase tracking-wider">ID Apertura (Turno):</span>
                                    <span className="text-slate-700 font-mono font-bold">#{selectedRetiro.IdApertura}</span>
                                </div>

                                <div className="h-px bg-slate-100"></div>

                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400 font-bold uppercase tracking-wider">Estatus Operativo:</span>
                                    <span className={cn(
                                        "font-bold px-2 py-0.5 rounded text-[11px]",
                                        selectedRetiro.Status === 0
                                            ? "bg-emerald-50 text-emerald-800"
                                            : "bg-red-50 text-red-800"
                                    )}>
                                        {selectedRetiro.Status === 0 ? 'Válido' : 'Cancelado'}
                                    </span>
                                </div>

                                <div className="h-px bg-slate-100"></div>

                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400 font-bold uppercase tracking-wider">Tipo de Retiro:</span>
                                    <span className="text-slate-700 font-semibold">
                                        {selectedRetiro.TipoRetiro === 0 ? 'Parcial / Salida Ordinaria' : 'Retiro Total / Cierre'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer sum */}
                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between font-bold">
                            <div className="text-slate-400 text-xs uppercase tracking-wider">Efectivo Extraído</div>
                            <div className="text-2xl font-black text-rose-600 tabular-nums">
                                {formatCurrency(selectedRetiro.Efectivo)}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function RetirosDashboardPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin text-amber-600" size={40} />
            </div>
        }>
            <RetirosContent />
        </Suspense>
    );
}
