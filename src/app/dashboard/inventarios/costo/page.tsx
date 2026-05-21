'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    Layers,
    RefreshCcw,
    DollarSign,
    AlertCircle,
    Download,
    Search,
    X,
    Eye,
    Package,
    ArrowUpDown,
    CheckCircle2,
    XCircle,
    Maximize,
    Minimize
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Cell
} from 'recharts';

// Types
interface SucursalCostRow {
    IdSucursal: number;
    Sucursal: string;
    CostoPositivo: number;
    ProductosPositivo: number;
    CostoCero: number;
    ProductosCero: number;
    CostoNegativo: number;
    ProductosNegativo: number;
    EnAlerta: number;
}

interface GlobalKPIs {
    inventarioValorizado: number;
    netValorizado: number;
    costoPositivo: number;
    costoNegativo: number;
    productosPositivo: number;
    productosCero: number;
    productosNegativo: number;
    enAlerta: number;
}

interface ItemDetailRow {
    IdArticulo: number;
    IdSucursal: number;
    Producto: string;
    Descripcion: string;
    Codigo: string;
    Depto: string;
    Marca: string;
    Exi: number;
    CostoUnitario: number;
    CostoTotal: number;
    ExiMinRes: number;
    EnAlerta: number;
}

export default function CostoInventarioPage() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState<SucursalCostRow[]>([]);
    const [kpis, setKpis] = useState<GlobalKPIs>({
        inventarioValorizado: 0,
        netValorizado: 0,
        costoPositivo: 0,
        costoNegativo: 0,
        productosPositivo: 0,
        productosCero: 0,
        productosNegativo: 0,
        enAlerta: 0
    });
    const [lastUpdated, setLastUpdated] = useState<string>('');

    // Sort summary table
    const [summarySort, setSummarySort] = useState<{ key: keyof SucursalCostRow; direction: 'asc' | 'desc' } | null>({
        key: 'CostoPositivo',
        direction: 'desc'
    });

    // Drilldown state
    const [modalOpen, setModalOpen] = useState(false);
    const [drilldownSucursal, setDrilldownSucursal] = useState<{ id: string; name: string }>({ id: 'all', name: 'Todas las Sucursales' });
    const [drilldownItems, setDrilldownItems] = useState<ItemDetailRow[]>([]);
    const [drilldownLoading, setDrilldownLoading] = useState(false);
    const [drilldownError, setDrilldownError] = useState<string | null>(null);
    const [drilldownMaximized, setDrilldownMaximized] = useState(false);

    // Drilldown filter / pagination state
    const [drilldownSearch, setDrilldownSearch] = useState('');
    const [drilldownStatusFilter, setDrilldownStatusFilter] = useState<'todos' | 'existencias' | 'cero' | 'negativos' | 'alerta'>('todos');
    const [drilldownPage, setDrilldownPage] = useState(1);
    const drilldownItemsPerPage = 50;

    // Fetch primary data
    const fetchData = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            const response = await fetch('/api/inventarios/costo');
            const json = await response.json();
            if (json.success) {
                setData(json.data);
                setKpis(json.kpis);
                const now = new Date();
                setLastUpdated(now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
            }
        } catch (error) {
            console.error('Error fetching inventory cost summary:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Fetch details for drilldown
    const fetchDetails = async (sucursalId: string, sucursalName: string, statusFilterOverride?: typeof drilldownStatusFilter) => {
        setDrilldownSucursal({ id: sucursalId, name: sucursalName });
        setDrilldownLoading(true);
        setDrilldownError(null);
        setDrilldownSearch('');
        setDrilldownPage(1);
        if (statusFilterOverride) {
            setDrilldownStatusFilter(statusFilterOverride);
        } else {
            setDrilldownStatusFilter('todos');
        }
        setModalOpen(true);

        try {
            const targetStatus = statusFilterOverride || 'todos';
            const url = `/api/inventarios/costo/detalles?idSucursal=${sucursalId}&status=${targetStatus}`;
            const response = await fetch(url);
            const json = await response.json();
            if (json.success) {
                setDrilldownItems(json.data);
            } else {
                setDrilldownError(json.error || 'No se pudieron cargar los detalles.');
            }
        } catch (error: any) {
            setDrilldownError(error.message || 'Error de conexión.');
        } finally {
            setDrilldownLoading(false);
        }
    };

    // Refetch details when filter changes inside modal (API-driven to load fresh matching subset)
    const handleModalFilterChange = async (newStatus: typeof drilldownStatusFilter) => {
        setDrilldownStatusFilter(newStatus);
        setDrilldownLoading(true);
        setDrilldownPage(1);
        try {
            const url = `/api/inventarios/costo/detalles?idSucursal=${drilldownSucursal.id}&status=${newStatus}&search=${encodeURIComponent(drilldownSearch)}`;
            const response = await fetch(url);
            const json = await response.json();
            if (json.success) {
                setDrilldownItems(json.data);
            }
        } catch (error) {
            console.error('Error filtering details:', error);
        } finally {
            setDrilldownLoading(false);
        }
    };

    // Client side instant search inside fetched list
    const handleModalSearch = async (val: string) => {
        setDrilldownSearch(val);
        setDrilldownPage(1);
        // Execute API search to ensure we hit database indexes for matching barcodes/SKUs
        setDrilldownLoading(true);
        try {
            const url = `/api/inventarios/costo/detalles?idSucursal=${drilldownSucursal.id}&status=${drilldownStatusFilter}&search=${encodeURIComponent(val)}`;
            const response = await fetch(url);
            const json = await response.json();
            if (json.success) {
                setDrilldownItems(json.data);
            }
        } catch (error) {
            console.error('Error searching details:', error);
        } finally {
            setDrilldownLoading(false);
        }
    };

    // Format helpers
    const formatCurrency = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return '$0.00';
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
    };

    const formatNumber = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return '0';
        return new Intl.NumberFormat('es-MX').format(num);
    };

    // Sort logic for summary table
    const handleSortSummary = (key: keyof SucursalCostRow) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (summarySort && summarySort.key === key && summarySort.direction === 'asc') {
            direction = 'desc';
        }
        setSummarySort({ key, direction });
    };

    const sortedSummaryData = useMemo(() => {
        if (!summarySort) return data;
        return [...data].sort((a, b) => {
            const aVal = Number(a[summarySort.key]);
            const bVal = Number(b[summarySort.key]);
            if (aVal < bVal) return summarySort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return summarySort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [data, summarySort]);

    // Recharts Data Prep
    const chartData = useMemo(() => {
        return data.map(row => ({
            name: row.Sucursal,
            id: row.IdSucursal,
            'Costo Positivo': Number(row.CostoPositivo),
            'Costo Negativo': Number(row.CostoNegativo)
        }));
    }, [data]);

    // Excel export for drilldown items
    const handleExportExcel = () => {
        if (drilldownItems.length === 0) return;

        const exportData = drilldownItems.map(item => ({
            'Código': item.Codigo,
            'Producto': item.Producto,
            'Descripción': item.Descripcion,
            'Departamento': item.Depto,
            'Marca': item.Marca,
            'Existencia Actual': item.Exi,
            'Costo Unitario': item.CostoUnitario,
            'Costo Total': item.CostoTotal,
            'Existencia Mínima': item.ExiMinRes,
            'Estatus': item.EnAlerta ? 'Bajo Mínimo' : (item.Exi < 0 ? 'Negativo' : (item.Exi === 0 ? 'Sin Stock' : 'Correcto'))
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario_Detallado");

        const safeName = drilldownSucursal.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        XLSX.writeFile(workbook, `Inventario_Costo_${safeName}.xlsx`);
    };

    // Client side detail sorting inside drilldown
    const [detailSort, setDetailSort] = useState<{ key: keyof ItemDetailRow; direction: 'asc' | 'desc' } | null>({
        key: 'CostoTotal',
        direction: 'desc'
    });

    const handleSortDetail = (key: keyof ItemDetailRow) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (detailSort && detailSort.key === key && detailSort.direction === 'asc') {
            direction = 'desc';
        }
        setDetailSort({ key, direction });
    };

    const sortedDetailItems = useMemo(() => {
        if (!detailSort) return drilldownItems;
        return [...drilldownItems].sort((a, b) => {
            const valA = a[detailSort.key];
            const valB = b[detailSort.key];

            if (typeof valA === 'string' && typeof valB === 'string') {
                return detailSort.direction === 'asc' 
                    ? valA.localeCompare(valB) 
                    : valB.localeCompare(valA);
            }

            const numA = Number(valA || 0);
            const numB = Number(valB || 0);
            if (numA < numB) return detailSort.direction === 'asc' ? -1 : 1;
            if (numA > numB) return detailSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [drilldownItems, detailSort]);

    // Client side pagination calculations
    const paginatedItems = useMemo(() => {
        const startIndex = (drilldownPage - 1) * drilldownItemsPerPage;
        return sortedDetailItems.slice(startIndex, startIndex + drilldownItemsPerPage);
    }, [sortedDetailItems, drilldownPage]);

    const totalPages = Math.ceil(sortedDetailItems.length / drilldownItemsPerPage);

    return (
        <div className="space-y-6 relative min-h-[calc(100vh-140px)] animate-in fade-in duration-300">
            
            {/* Header: Pure Premium, NO dates/periods */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white py-4 px-6 rounded-2xl shadow-xs border border-slate-100 animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3 select-none">
                        <Layers className="text-blue-600 shrink-0" />
                        Costo de Inventario
                    </h1>

                    {/* Status Badge */}
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full px-3.5 py-1">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Inventario Actual</span>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {lastUpdated && (
                        <p className="text-xs font-semibold text-slate-400">
                            Última consulta: <span className="text-slate-600 font-bold">{lastUpdated}</span>
                        </p>
                    )}
                    <button
                        onClick={() => fetchData(true)}
                        className="p-2.5 bg-slate-50 border border-slate-200 text-blue-600 hover:bg-slate-100 hover:border-slate-300 transition-all rounded-xl shadow-xs cursor-pointer flex items-center justify-center disabled:opacity-50"
                        disabled={refreshing || loading}
                        title="Actualizar Inventario"
                    >
                        <RefreshCcw size={16} className={cn((refreshing || loading) && "animate-spin")} />
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <RefreshCcw size={40} className="animate-spin text-blue-600" />
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest animate-pulse">Cargando Costos de Inventario...</p>
                </div>
            ) : (
                <>
                    {/* KPI Cards: Dynamic Drilldown Trigger on Click */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                        
                        {/* KPI 1: Inventario Valorizado */}
                        <div 
                            onClick={() => fetchDetails('all', 'Todas las Sucursales', 'existencias')}
                            className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-4 hover:shadow-md hover:border-blue-200 hover:scale-[1.01] transition-all cursor-pointer group"
                        >
                            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                <DollarSign size={24} />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Inventario Valorizado</p>
                                <h3 className="text-2xl font-black text-slate-950 mt-0.5 tabular-nums">{formatCurrency(kpis.costoPositivo)}</h3>
                                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                                    En <span className="text-blue-600 font-bold">{formatNumber(kpis.productosPositivo)}</span> SKUs activos
                                </p>
                            </div>
                        </div>

                        {/* KPI 2: Costo Negativo */}
                        <div 
                            onClick={() => fetchDetails('all', 'Todas las Sucursales', 'negativos')}
                            className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-4 hover:shadow-md hover:border-amber-200 hover:scale-[1.01] transition-all cursor-pointer group"
                        >
                            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-amber-600 group-hover:text-white transition-all">
                                <AlertCircle size={24} />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Desajuste Negativo</p>
                                <h3 className="text-2xl font-black text-slate-950 mt-0.5 tabular-nums text-amber-600">{formatCurrency(kpis.costoNegativo)}</h3>
                                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                                    En <span className="text-amber-600 font-bold">{formatNumber(kpis.productosNegativo)}</span> SKUs con stock menor a 0
                                </p>
                            </div>
                        </div>

                        {/* KPI 3: Inventario Neto */}
                        <div 
                            onClick={() => fetchDetails('all', 'Todas las Sucursales', 'todos')}
                            className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-4 hover:shadow-md hover:border-slate-200 hover:scale-[1.01] transition-all cursor-pointer group"
                        >
                            <div className="w-12 h-12 bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-slate-800 group-hover:text-white transition-all">
                                <Package size={24} />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Inventario Neto</p>
                                <h3 className="text-2xl font-black text-slate-950 mt-0.5 tabular-nums">{formatCurrency(kpis.netValorizado)}</h3>
                                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                                    Total SKU global: <span className="text-slate-700 font-bold">{formatNumber(kpis.productosPositivo + kpis.productosCero + kpis.productosNegativo)}</span>
                                </p>
                            </div>
                        </div>

                        {/* KPI 4: Alertas de Resurtido */}
                        <div 
                            onClick={() => fetchDetails('all', 'Todas las Sucursales', 'alerta')}
                            className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-4 hover:shadow-md hover:border-rose-200 hover:scale-[1.01] transition-all cursor-pointer group"
                        >
                            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-rose-600 group-hover:text-white transition-all">
                                <AlertCircle size={24} />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Alertas de Resurtido</p>
                                <h3 className="text-2xl font-black text-rose-600 mt-0.5 tabular-nums">{formatNumber(kpis.enAlerta)}</h3>
                                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                                    SKUs con existencia <span className="text-rose-600 font-bold">bajo mínimo</span>
                                </p>
                            </div>
                        </div>

                    </div>

                    {/* Chart Panel */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-lg font-extrabold text-slate-800 uppercase tracking-wider">Costo por Sucursal</h2>
                                <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest mt-0.5">Balance de costos valorizados (positivo vs negativo)</p>
                            </div>
                        </div>

                        <div className="h-80 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={chartData}
                                    margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                                    onClick={(state: any) => {
                                        if (state && state.activePayload && state.activePayload.length > 0) {
                                            const payload = state.activePayload[0].payload;
                                            fetchDetails(payload.id, payload.name);
                                        }
                                    }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                                    <XAxis 
                                        dataKey="name" 
                                        tick={{ fill: '#64748B', fontSize: 10, fontWeight: 700 }}
                                        tickLine={false}
                                        axisLine={false}
                                        dy={10}
                                    />
                                    <YAxis 
                                        tickFormatter={formatCurrency}
                                        tick={{ fill: '#64748B', fontSize: 10, fontWeight: 700 }}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip 
                                        formatter={(val) => formatCurrency(val)}
                                        contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                                    />
                                    <Legend verticalAlign="top" height={36} />
                                    <Bar dataKey="Costo Positivo" stackId="a" fill="#2563EB" radius={[4, 4, 0, 0]} cursor="pointer">
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} className="hover:opacity-85 transition-opacity" />
                                        ))}
                                    </Bar>
                                    <Bar dataKey="Costo Negativo" stackId="a" fill="#EF4444" radius={[0, 0, 4, 4]} cursor="pointer">
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-neg-${index}`} className="hover:opacity-85 transition-opacity" />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Summary Branch Grid */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-extrabold text-slate-800 uppercase tracking-wider">Tabla de Resumen por Sucursal</h2>
                                <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest mt-0.5">Métricas de existencias e inventarios por punto de venta</p>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 select-none">
                                        <th 
                                            onClick={() => handleSortSummary('Sucursal')}
                                            className="px-6 py-4 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors"
                                        >
                                            <div className="flex items-center gap-1">
                                                Sucursal <ArrowUpDown size={12} />
                                            </div>
                                        </th>
                                        <th 
                                            onClick={() => handleSortSummary('CostoPositivo')}
                                            className="px-6 py-4 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors text-right"
                                        >
                                            <div className="flex items-center justify-end gap-1">
                                                Costo Positivo <ArrowUpDown size={12} />
                                            </div>
                                        </th>
                                        <th 
                                            onClick={() => handleSortSummary('ProductosPositivo')}
                                            className="px-6 py-4 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors text-right"
                                        >
                                            <div className="flex items-center justify-end gap-1">
                                                SKU con Existencia <ArrowUpDown size={12} />
                                            </div>
                                        </th>
                                        <th 
                                            onClick={() => handleSortSummary('CostoNegativo')}
                                            className="px-6 py-4 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors text-right"
                                        >
                                            <div className="flex items-center justify-end gap-1">
                                                Costo Negativo <ArrowUpDown size={12} />
                                            </div>
                                        </th>
                                        <th 
                                            onClick={() => handleSortSummary('ProductosNegativo')}
                                            className="px-6 py-4 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors text-right"
                                        >
                                            <div className="flex items-center justify-end gap-1">
                                                SKU Negativos <ArrowUpDown size={12} />
                                            </div>
                                        </th>
                                        <th 
                                            onClick={() => handleSortSummary('EnAlerta')}
                                            className="px-6 py-4 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors text-right"
                                        >
                                            <div className="flex items-center justify-end gap-1">
                                                Productos en Alerta <ArrowUpDown size={12} />
                                            </div>
                                        </th>
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-center w-24">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {sortedSummaryData.map((row) => (
                                        <tr 
                                            key={row.IdSucursal} 
                                            className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                                            onClick={() => fetchDetails(String(row.IdSucursal), row.Sucursal)}
                                        >
                                            <td className="px-6 py-4 font-bold text-slate-700 text-sm">{row.Sucursal}</td>
                                            <td className="px-6 py-4 text-right font-bold text-slate-800 text-sm tabular-nums">{formatCurrency(row.CostoPositivo)}</td>
                                            <td className="px-6 py-4 text-right text-slate-500 font-semibold text-sm tabular-nums">{formatNumber(row.ProductosPositivo)}</td>
                                            <td className="px-6 py-4 text-right font-bold text-amber-600 text-sm tabular-nums">{formatCurrency(row.CostoNegativo)}</td>
                                            <td className="px-6 py-4 text-right text-slate-500 font-semibold text-sm tabular-nums">{formatNumber(row.ProductosNegativo)}</td>
                                            <td className="px-6 py-4 text-right font-extrabold text-rose-600 text-sm tabular-nums">{formatNumber(row.EnAlerta)}</td>
                                            <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => fetchDetails(String(row.IdSucursal), row.Sucursal)}
                                                    className="p-1.5 text-blue-600 hover:bg-blue-50 border border-transparent rounded-lg transition-colors cursor-pointer"
                                                    title="Ver Detalles"
                                                >
                                                    <Eye size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* Drilldown Drawer Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-300 p-4">
                    <div className={cn(
                        "glass-panel shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 transition-all border border-slate-200/50 backdrop-blur-2xl bg-white/95",
                        drilldownMaximized ? "w-full h-[100dvh] max-w-none rounded-none" : "rounded-2xl w-full max-w-6xl max-h-[90vh]"
                    )}>
                        
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-6 border-b border-slate-200/40 bg-gradient-to-r from-slate-50/40 to-transparent">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl">
                                    <Layers size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-slate-800 uppercase tracking-wider">
                                        Desglose de Inventario - {drilldownSucursal.name}
                                    </h2>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                        Mostrando artículos valorados al costo
                                    </p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleExportExcel}
                                    disabled={drilldownLoading || drilldownItems.length === 0}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-bold text-xs uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs cursor-pointer"
                                >
                                    <Download size={14} />
                                    Exportar Excel
                                </button>
                                <button
                                    onClick={() => setDrilldownMaximized(!drilldownMaximized)}
                                    className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-transparent rounded-xl transition-all cursor-pointer"
                                    title={drilldownMaximized ? "Restaurar" : "Maximizar"}
                                >
                                    {drilldownMaximized ? <Minimize size={18} /> : <Maximize size={18} />}
                                </button>
                                <button
                                    onClick={() => setModalOpen(false)}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 border border-transparent rounded-xl transition-all cursor-pointer"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body & Filters */}
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            
                            {/* Filter Tabs */}
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={() => handleModalFilterChange('todos')}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer",
                                        drilldownStatusFilter === 'todos'
                                            ? "bg-slate-800 border-slate-800 text-white shadow-xs"
                                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                    )}
                                >
                                    Todos
                                </button>
                                <button
                                    onClick={() => handleModalFilterChange('existencias')}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer flex items-center gap-1.5",
                                        drilldownStatusFilter === 'existencias'
                                            ? "bg-blue-600 border-blue-600 text-white shadow-xs"
                                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                    )}
                                >
                                    <CheckCircle2 size={12} />
                                    Con Existencia
                                </button>
                                <button
                                    onClick={() => handleModalFilterChange('cero')}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer flex items-center gap-1.5",
                                        drilldownStatusFilter === 'cero'
                                            ? "bg-yellow-500 border-yellow-500 text-white shadow-xs"
                                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                    )}
                                >
                                    <XCircle size={12} />
                                    Agotados
                                </button>
                                <button
                                    onClick={() => handleModalFilterChange('negativos')}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer flex items-center gap-1.5",
                                        drilldownStatusFilter === 'negativos'
                                            ? "bg-amber-600 border-amber-600 text-white shadow-xs"
                                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                    )}
                                >
                                    <AlertCircle size={12} />
                                    Negativos
                                </button>
                                <button
                                    onClick={() => handleModalFilterChange('alerta')}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer flex items-center gap-1.5",
                                        drilldownStatusFilter === 'alerta'
                                            ? "bg-rose-600 border-rose-600 text-white shadow-xs"
                                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                    )}
                                >
                                    <AlertCircle size={12} />
                                    Bajo Mínimo (Alerta)
                                </button>
                            </div>

                            {/* Local Search Input */}
                            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 w-full md:w-80 shadow-2xs">
                                <Search size={16} className="text-slate-400" />
                                <input
                                    type="text"
                                    value={drilldownSearch}
                                    onChange={(e) => handleModalSearch(e.target.value)}
                                    placeholder="Buscar por producto, marca, código..."
                                    className="bg-transparent text-xs font-bold text-slate-700 outline-none p-0 border-none h-auto w-full"
                                />
                                {drilldownSearch && (
                                    <button 
                                        onClick={() => handleModalSearch('')} 
                                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                        </div>

                        {/* Modal Items List Grid */}
                        <div className="flex-1 overflow-y-auto min-h-[300px]">
                            {drilldownLoading ? (
                                <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-3">
                                    <RefreshCcw size={32} className="animate-spin text-blue-500" />
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest animate-pulse">Cargando desglose de productos...</p>
                                </div>
                            ) : drilldownError ? (
                                <div className="flex items-center justify-center h-full min-h-[300px] text-red-500 font-semibold">
                                    {drilldownError}
                                </div>
                            ) : drilldownItems.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-slate-400 py-10">
                                    <Package size={48} strokeWidth={1.5} className="mb-2 text-slate-300" />
                                    <p className="text-sm font-semibold uppercase tracking-wider">No se encontraron artículos</p>
                                    <p className="text-xs">Prueba ajustando tus filtros o término de búsqueda.</p>
                                </div>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 sticky top-0 select-none">
                                            <th 
                                                onClick={() => handleSortDetail('Codigo')}
                                                className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors"
                                            >
                                                <div className="flex items-center gap-1">Código <ArrowUpDown size={12} /></div>
                                            </th>
                                            <th 
                                                onClick={() => handleSortDetail('Producto')}
                                                className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors"
                                            >
                                                <div className="flex items-center gap-1">Producto <ArrowUpDown size={12} /></div>
                                            </th>
                                            <th 
                                                onClick={() => handleSortDetail('Descripcion')}
                                                className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors"
                                            >
                                                <div className="flex items-center gap-1">Descripción <ArrowUpDown size={12} /></div>
                                            </th>
                                            <th 
                                                onClick={() => handleSortDetail('Depto')}
                                                className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors"
                                            >
                                                <div className="flex items-center gap-1">Depto <ArrowUpDown size={12} /></div>
                                            </th>
                                            <th 
                                                onClick={() => handleSortDetail('Marca')}
                                                className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors"
                                            >
                                                <div className="flex items-center gap-1">Marca <ArrowUpDown size={12} /></div>
                                            </th>
                                            <th 
                                                onClick={() => handleSortDetail('Exi')}
                                                className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors text-right"
                                            >
                                                <div className="flex items-center justify-end gap-1">Stock <ArrowUpDown size={12} /></div>
                                            </th>
                                            <th 
                                                onClick={() => handleSortDetail('CostoUnitario')}
                                                className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors text-right"
                                            >
                                                <div className="flex items-center justify-end gap-1">Costo Unitario <ArrowUpDown size={12} /></div>
                                            </th>
                                            <th 
                                                onClick={() => handleSortDetail('CostoTotal')}
                                                className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors text-right"
                                            >
                                                <div className="flex items-center justify-end gap-1">Costo Total <ArrowUpDown size={12} /></div>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {paginatedItems.map((item) => (
                                            <tr key={`${item.IdSucursal}-${item.IdArticulo}`} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-6 py-3 text-xs font-bold text-slate-500 tabular-nums">{item.Codigo}</td>
                                                <td className="px-6 py-3 text-sm font-semibold text-slate-800">{item.Producto}</td>
                                                <td className="px-6 py-3 text-sm text-slate-500">{item.Descripcion}</td>
                                                <td className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{item.Depto}</td>
                                                <td className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{item.Marca}</td>
                                                <td className="px-6 py-3 text-right">
                                                    <div className="flex flex-col items-end">
                                                        <span className={cn(
                                                            "text-sm font-bold tabular-nums",
                                                            item.EnAlerta ? "text-rose-600" : (item.Exi < 0 ? "text-amber-600" : "text-slate-800")
                                                        )}>
                                                            {formatNumber(item.Exi)}
                                                        </span>
                                                        {item.EnAlerta === 1 && (
                                                            <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest mt-0.5">Bajo Mínimo ({item.ExiMinRes})</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3 text-right text-xs font-bold text-slate-500 tabular-nums">{formatCurrency(item.CostoUnitario)}</td>
                                                <td className="px-6 py-3 text-right text-sm font-extrabold text-slate-900 tabular-nums">{formatCurrency(item.CostoTotal)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Modal Footer & Pagination */}
                        {!drilldownLoading && drilldownItems.length > 0 && (
                            <div className="p-4 border-t border-slate-200/40 bg-slate-50 flex items-center justify-between">
                                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                                    Mostrando {formatNumber(Math.min(drilldownItems.length, (drilldownPage - 1) * drilldownItemsPerPage + 1))} - {formatNumber(Math.min(drilldownItems.length, drilldownPage * drilldownItemsPerPage))} de {formatNumber(drilldownItems.length)} SKUs
                                    {drilldownItems.length >= 500 && " (Máximo listado en drilldown)"}
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setDrilldownPage(prev => Math.max(prev - 1, 1))}
                                        disabled={drilldownPage === 1}
                                        className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                    >
                                        Anterior
                                    </button>
                                    <div className="text-xs text-slate-500 font-bold">
                                        Pág. {drilldownPage} de {totalPages || 1}
                                    </div>
                                    <button
                                        onClick={() => setDrilldownPage(prev => Math.min(prev + 1, totalPages))}
                                        disabled={drilldownPage === totalPages}
                                        className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                    >
                                        Siguiente
                                    </button>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            )}

        </div>
    );
}
