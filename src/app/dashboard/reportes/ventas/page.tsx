'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    X,
    Download,
    FileSpreadsheet,
    Loader2,
    Store,
    Maximize,
    Minimize,
    ArrowUpDown,
    Calendar,
    Filter,
    ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import VentasItemDetailModal from '@/components/VentasItemDetailModal';
import DatePresets from '@/components/DatePresets';

function ReportContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [sucursales, setSucursales] = useState<{ id: number; name: string }[]>([]);
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filter states from URL
    const startDate = searchParams.get('startDate') || getFirstOfMonth();
    const endDate = searchParams.get('endDate') || getToday();
    const sucursalId = searchParams.get('sucursalId') || '';

    // Table States
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [filters, setFilters] = useState<Record<string, string>>({});

    // Item Modal State
    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [selectedIdVenta, setSelectedIdVenta] = useState<number | null>(null);
    const [selectedFolioVenta, setSelectedFolioVenta] = useState<string>('');
    const [selectedClienteName, setSelectedClienteName] = useState<string>('');

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

    // Fetch branches
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

    // Fetch sales data
    useEffect(() => {
        if (!sucursalId || !startDate || !endDate) {
            setData([]);
            return;
        }

        let isMounted = true;
        const fetchData = async () => {
            setLoading(true);
            setError(null);

            try {
                const url = `/api/ventas-detalle?startDate=${startDate}&endDate=${endDate}&sucursalId=${sucursalId}`;
                const response = await fetch(url);
                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Failed to fetch details');
                }

                if (isMounted) {
                    setData(result.data || []);
                }
            } catch (err: any) {
                if (isMounted) setError(err.message);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData();
        return () => { isMounted = false; };
    }, [sucursalId, startDate, endDate]);

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
                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [data, filters, sortConfig]);

    const handleExportExcel = () => {
        if (sortedAndFilteredData.length === 0) return;
        const exportData = sortedAndFilteredData.map(row => {
            const { IdVenta, IdSucursal, ...rest } = row;
            return rest;
        });
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "ReporteVentas");
        const selectedSucursal = sucursales.find(s => s.id.toString() === sucursalId)?.name || 'Sucursal';
        const safeName = selectedSucursal.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        XLSX.writeFile(workbook, `Reporte_Ventas_${safeName}_${startDate}_al_${endDate}.xlsx`);
    };

    const formatCurrency = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return val;
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
    };

    const cols = data.length > 0 ? Object.keys(data[0]).filter(k => k !== 'IdVenta' && k !== 'IdSucursal') : [];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Reporte de Ventas</h1>
                    <p className="text-slate-500 mt-1">Consulta detallada de ventas por sucursal y periodo</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExportExcel}
                        disabled={loading || data.length === 0}
                        className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-95"
                    >
                        <FileSpreadsheet size={18} />
                        <span className="hidden sm:inline">Exportar Excel</span>
                    </button>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap items-center gap-6">
                <div className="flex flex-col gap-1.5 min-w-[200px]">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        <Store size={14} className="text-blue-500" />
                        Sucursal
                    </div>
                    <div className="relative">
                        <select
                            value={sucursalId}
                            onChange={(e) => handleParamChange('sucursalId', e.target.value)}
                            className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                        >
                            <option value="">Selecciona una sucursal</option>
                            {sucursales.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                    </div>
                </div>

                <div className="flex flex-col gap-1.5 min-w-[300px]">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        <Calendar size={14} className="text-indigo-500" />
                        Periodo de Tiempo
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Del</span>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => handleParamChange('startDate', e.target.value)}
                                    className="bg-transparent text-sm font-semibold text-slate-700 focus:outline-none cursor-pointer"
                                />
                            </div>
                            <div className="h-4 w-px bg-slate-300"></div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Al</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => handleParamChange('endDate', e.target.value)}
                                    className="bg-transparent text-sm font-semibold text-slate-700 focus:outline-none cursor-pointer"
                                />
                            </div>
                        </div>
                        <div className="hidden sm:block w-px h-8 bg-slate-100"></div>
                        <DatePresets />
                    </div>
                </div>
            </div>

            {/* Table Area */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col min-h-[400px]">
                {!sucursalId ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
                        <div className="mb-4">
                            <Filter size={48} className="text-blue-500 opacity-40" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900">Selecciona una sucursal</h3>
                        <p className="mt-1 max-w-xs">Elige una sucursal y un periodo de tiempo para visualizar los registros de ventas.</p>
                    </div>
                ) : loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center h-64 text-slate-500">
                        <Loader2 className="animate-spin mb-4 text-blue-600" size={40} />
                        <p className="font-medium">Obteniendo registros de ventas...</p>
                    </div>
                ) : error ? (
                    <div className="flex-1 flex flex-col items-center justify-center h-64 text-red-500">
                        <p className="font-bold text-lg">Error al cargar datos</p>
                        <p className="text-sm opacity-80 mt-1">{error}</p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[calc(100vh-380px)]">
                        <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
                            <thead className="bg-slate-50 sticky top-0 shadow-sm z-10 border-b border-slate-200">
                                <tr>
                                    {cols.map(col => (
                                        <th
                                            key={`th-${col}`}
                                            className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group"
                                            onClick={() => handleSort(col)}
                                        >
                                            <div className="flex items-center gap-1 justify-between">
                                                {col}
                                                <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === col && "opacity-100 text-blue-500")} />
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                                <tr className="bg-slate-50/80 backdrop-blur border-b border-slate-200">
                                    {cols.map(col => (
                                        <th key={`filter-${col}`} className="px-3 py-2 font-normal">
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    placeholder={`Filtrar...`}
                                                    value={filters[col] || ''}
                                                    onChange={(e) => handleFilterChange(col, e.target.value)}
                                                    className="w-full min-w-[120px] pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 bg-white font-normal"
                                                />
                                                <Filter size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sortedAndFilteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan={cols.length} className="px-6 py-12 text-center text-slate-400">
                                            No se encontraron registros en este periodo.
                                        </td>
                                    </tr>
                                ) : (
                                    sortedAndFilteredData.map((row, idx) => (
                                        <tr
                                            key={idx}
                                            className="hover:bg-blue-50/50 transition-colors group cursor-pointer"
                                            onClick={() => {
                                                setSelectedIdVenta(row.IdVenta);
                                                setSelectedFolioVenta(row['Folio Venta'] || 'Desconocido');
                                                setSelectedClienteName(row.Cliente || '');
                                                setIsItemModalOpen(true);
                                            }}
                                        >
                                            {cols.map(col => {
                                                const val = row[col];
                                                const isCurrency = col.toLowerCase().includes('total') || col.toLowerCase().includes('pago');
                                                const isFolio = col === 'Folio Venta';

                                                return (
                                                    <td key={col} className={cn(
                                                        "px-6 py-4 transition-all duration-200",
                                                        isCurrency ? "text-right font-bold text-slate-800" : "text-slate-600",
                                                        isFolio && "font-mono text-blue-600"
                                                    )}>
                                                        {val !== null && val !== undefined ? (isCurrency ? formatCurrency(val) : val) : '-'}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <VentasItemDetailModal
                isOpen={isItemModalOpen}
                onClose={() => setIsItemModalOpen(false)}
                idVenta={selectedIdVenta}
                idSucursal={parseInt(sucursalId)}
                folioVenta={selectedFolioVenta}
                clienteName={selectedClienteName}
            />
        </div>
    );
}

export default function ReporteVentasPage() {
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
