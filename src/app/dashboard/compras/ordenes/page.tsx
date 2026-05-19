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
    ShoppingBag,
    DollarSign,
    CheckCircle,
    Clock,
    Eye,
    Package,
    ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import DatePresets from '@/components/DatePresets';

function ComprasContent() {
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
    const statusTab = searchParams.get('status') || 'all'; // 'all' | 'pending' | 'received'

    // Table States
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [filters, setFilters] = useState<Record<string, string>>({});

    // Detail Drawer State
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
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

    // Fetch Orders
    useEffect(() => {
        let isMounted = true;
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const url = `/api/compras/ordenes?startDate=${startDate}&endDate=${endDate}&idTienda=${idTienda}&status=${statusTab}`;
                const response = await fetch(url);
                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Error al obtener órdenes de compra');
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

    // Fetch Order details when selectedOrder changes
    useEffect(() => {
        if (!selectedOrder) {
            setDetailItems([]);
            return;
        }

        let isMounted = true;
        const fetchDetails = async () => {
            setDetailLoading(true);
            setDetailError(null);
            try {
                const url = `/api/compras/ordenes/details?idOrdenCompra=${selectedOrder.IdOrdenCompra}&iteracion=${selectedOrder.Iteracion}`;
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
    }, [selectedOrder]);

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
        let totalOrders = data.length;
        let totalAmount = data.reduce((acc, row) => acc + (row.Total || 0), 0);
        let receivedOrders = data.filter(row => row.Recibida === 1).length;
        let pendingOrders = data.filter(row => row.Recibida === 0).length;

        return {
            totalOrders,
            totalAmount,
            receivedOrders,
            pendingOrders
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
            Folio: row.Folio,
            Proveedor: row.Proveedor,
            Sucursal: row.Tienda,
            Fecha: new Date(row.Fecha).toLocaleDateString('es-MX'),
            Productos: row.CantProductos,
            Total: row.Total,
            Creador: row.Creador,
            Receptor: row.Receptor,
            Estatus: row.Recibida === 1 ? 'Recibida' : 'Pendiente',
            IdTraspaso: row.IdTraspaso || 'No'
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "OrdenesCompra");
        const selectedSucursal = sucursales.find(s => s.id.toString() === idTienda)?.name || 'Todas';
        const safeName = selectedSucursal.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        XLSX.writeFile(workbook, `Ordenes_Compra_${safeName}_${startDate}_al_${endDate}.xlsx`);
    };

    const formatCurrency = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return val;
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
    };

    const formatDate = (val: string) => {
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
        { key: 'Folio', label: 'Folio' },
        { key: 'Tienda', label: 'Sucursal' },
        { key: 'Proveedor', label: 'Proveedor' },
        { key: 'Fecha', label: 'Fecha Orden' },
        { key: 'CantProductos', label: 'Arts' },
        { key: 'Total', label: 'Total' },
        { key: 'Creador', label: 'Creador' },
        { key: 'Receptor', label: 'Receptor' },
        { key: 'Recibida', label: 'Estado' }
    ];

    return (
        <div className="space-y-6 relative min-h-[calc(100vh-140px)]">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Órdenes de Compra</h1>
                    <p className="text-slate-500 mt-1">Gestión, seguimiento e historial de órdenes de compra y traspasos</p>
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
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                        <ShoppingBag size={22} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Órdenes</p>
                        <h3 className="text-2xl font-black text-slate-950 mt-0.5 tabular-nums">{kpis.totalOrders}</h3>
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
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                        <CheckCircle size={22} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recibidas</p>
                        <h3 className="text-2xl font-black text-indigo-600 mt-0.5 tabular-nums">{kpis.receivedOrders}</h3>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                        <Clock size={22} className="animate-pulse" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pendientes</p>
                        <h3 className="text-2xl font-black text-amber-600 mt-0.5 tabular-nums">{kpis.pendingOrders}</h3>
                    </div>
                </div>
            </div>

            {/* Filter Panel */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap items-center justify-between gap-6">
                <div className="flex flex-wrap items-center gap-6">
                    {/* Sucursal Filter */}
                    <div className="flex flex-col gap-1.5 min-w-[200px]">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                            <Store size={14} className="text-blue-500" />
                            Sucursal
                        </div>
                        <div className="relative">
                            <select
                                value={idTienda}
                                onChange={(e) => handleParamChange('idTienda', e.target.value)}
                                className="w-full pl-3 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none cursor-pointer"
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

                {/* Status Tab filters */}
                <div className="flex bg-slate-100 rounded-xl p-0.5 shrink-0 self-end">
                    {[
                        { id: 'all', label: 'Todas' },
                        { id: 'pending', label: 'Pendientes' },
                        { id: 'received', label: 'Recibidas' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => handleParamChange('status', tab.id)}
                            className={cn(
                                "px-4 py-2 rounded-lg text-xs font-bold transition-all",
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

            {/* Orders Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col min-h-[400px]">
                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center h-64 text-slate-500">
                        <Loader2 className="animate-spin mb-4 text-blue-600" size={40} />
                        <p className="font-semibold text-sm">Consultando órdenes de compra...</p>
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
                                            No se encontraron órdenes de compra en este periodo.
                                        </td>
                                    </tr>
                                ) : (
                                    sortedAndFilteredData.map((row, idx) => {
                                        const isReceived = row.Recibida === 1;
                                        const isTransfer = row.IdTraspaso > 0;
                                        return (
                                            <tr
                                                key={idx}
                                                className="hover:bg-blue-50/40 transition-colors group cursor-pointer"
                                                onClick={() => setSelectedOrder(row)}
                                            >
                                                <td className="px-5 py-3 font-mono text-blue-600 font-bold text-xs">
                                                    {row.Folio}
                                                </td>
                                                <td className="px-5 py-3 text-slate-700 font-semibold text-xs truncate max-w-[150px]">
                                                    {row.Tienda}
                                                </td>
                                                <td className="px-5 py-3 text-slate-700 font-semibold text-xs truncate max-w-[200px]">
                                                    {row.Proveedor}
                                                </td>
                                                <td className="px-5 py-3 text-slate-600 text-xs">
                                                    {new Date(row.Fecha).toLocaleDateString('es-MX')}
                                                </td>
                                                <td className="px-5 py-3 text-slate-600 text-center text-xs tabular-nums">
                                                    {row.CantProductos}
                                                </td>
                                                <td className="px-5 py-3 text-slate-900 font-bold text-xs text-right tabular-nums">
                                                    {formatCurrency(row.Total)}
                                                </td>
                                                <td className="px-5 py-3 text-slate-600 text-xs">
                                                    {row.Creador}
                                                </td>
                                                <td className="px-5 py-3 text-slate-600 text-xs truncate max-w-[120px]">
                                                    {row.Receptor}
                                                </td>
                                                <td className="px-5 py-3 text-xs">
                                                    <span className={cn(
                                                        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold",
                                                        isReceived
                                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                                            : "bg-amber-50 text-amber-700 border border-amber-100"
                                                    )}>
                                                        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", isReceived ? "bg-emerald-500" : "bg-amber-500")}></span>
                                                        <span>{isReceived ? 'Recibida' : 'Pendiente'}</span>
                                                        {isTransfer && <span className="text-[9px] opacity-75 font-semibold">(Traspaso)</span>}
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

            {/* Centered Detail Modal */}
            {selectedOrder && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    {/* Modal container */}
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
                        {/* Modal Header */}
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                                        Orden de Compra
                                    </span>
                                    {selectedOrder.IdTraspaso > 0 && (
                                        <span className="text-xs font-bold px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded">
                                            Vía Traspaso #{selectedOrder.IdTraspaso}
                                        </span>
                                    )}
                                </div>
                                <h2 className="text-xl font-black text-slate-900 mt-1 flex items-center gap-2">
                                    Folio: <span className="font-mono text-blue-600 font-bold">{selectedOrder.Folio}</span>
                                </h2>
                            </div>
                            <button
                                onClick={() => setSelectedOrder(null)}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Order Metadata summary */}
                        <div className="p-6 bg-slate-50/30 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-medium text-slate-600">
                            <div>
                                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sucursal</span>
                                <span className="text-slate-900 font-bold text-sm block mt-0.5 truncate">{selectedOrder.Tienda}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Proveedor</span>
                                <span className="text-slate-900 font-bold text-sm block mt-0.5 truncate">{selectedOrder.Proveedor}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Creador</span>
                                <span className="text-slate-900 font-bold text-sm block mt-0.5 truncate">{selectedOrder.Creador}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado</span>
                                <span className={cn(
                                    "inline-flex items-center gap-1 font-bold rounded-full px-2.5 py-0.5 text-xs mt-0.5",
                                    selectedOrder.Recibida === 1 ? "bg-emerald-50 text-emerald-800 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"
                                )}>
                                    {selectedOrder.Recibida === 1 ? 'Recibida' : 'Pendiente'}
                                </span>
                            </div>
                        </div>

                        {/* Item lines Table */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
                            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                <Package size={16} className="text-slate-500" />
                                Artículos en la Orden
                            </h4>

                            {detailLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                    <Loader2 className="animate-spin mb-3 text-blue-600" size={32} />
                                    <span className="font-semibold text-xs">Cargando desglose de artículos...</span>
                                </div>
                            ) : detailError ? (
                                <div className="bg-red-50 text-red-700 p-4 rounded-xl text-xs border border-red-100 flex items-center gap-2">
                                    <span>Error al obtener detalle de la orden: {detailError}</span>
                                </div>
                            ) : detailItems.length === 0 ? (
                                <div className="text-center py-16 text-slate-400 text-xs">
                                    Esta orden de compra no contiene productos.
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

                        {/* Modal Footer summary total */}
                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between font-bold">
                            <div className="text-slate-400 text-xs uppercase tracking-wider">Total de la Orden</div>
                            <div className="text-2xl font-black text-slate-950 tabular-nums">
                                {formatCurrency(selectedOrder.Total)}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function PurchasesDashboardPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin text-blue-600" size={40} />
            </div>
        }>
            <ComprasContent />
        </Suspense>
    );
}
