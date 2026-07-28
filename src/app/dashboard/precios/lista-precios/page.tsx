'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    Loader2,
    Search,
    X,
    RefreshCcw,
    FileSpreadsheet,
    FileText,
    ArrowUpDown,
    Tag,
    Tags,
    Package,
    MapPin,
    Edit,
    Clock,
    TrendingUp,
    TrendingDown,
    Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildFormattedSheet, downloadXLSX, safeFileName } from '@/lib/excel-helpers';

type Zona = { id: number; name: string };

type PrecioRow = {
    Codigo: string;
    Descripcion: string;
    Costo: number | null;
    PrecioPublico: number | null;
    PrecioProfesor: number | null;
    PrecioDistribuidor: number | null;
    DistribuidoEspecial: number | null;
    FechaCambioPrecio: string | null;
};

const TEXT_KEYS = ['Codigo', 'Descripcion', 'FechaCambioPrecio'];

function ListaPreciosContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [zonas, setZonas] = useState<Zona[]>([]);
    const [zonasError, setZonasError] = useState<string | null>(null);

    const [data, setData] = useState<PrecioRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [search, setSearch] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'Descripcion', direction: 'asc' });

    // Drawer state
    const [selectedRow, setSelectedRow] = useState<PrecioRow | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editPrices, setEditPrices] = useState({ p1: '', p2: '', p3: '', p4: '' });
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // History state
    const [history, setHistory] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [historyYears, setHistoryYears] = useState(3);

    const zonaId = searchParams.get('zonaId') || '';

    // Catálogo de zonas
    useEffect(() => {
        let isMounted = true;
        const fetchZonas = async () => {
            try {
                const response = await fetch('/api/zonas');
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Error al obtener las zonas');
                if (isMounted) setZonas(result.data || []);
            } catch (err: any) {
                if (isMounted) setZonasError(err.message);
            }
        };
        fetchZonas();
        return () => { isMounted = false; };
    }, []);

    // Precios de la zona seleccionada
    useEffect(() => {
        if (!zonaId) {
            setData([]);
            setError(null);
            return;
        }

        let isMounted = true;
        const fetchData = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await fetch(`/api/precios/lista?zonaId=${encodeURIComponent(zonaId)}`);
                const result = await response.json();

                if (!response.ok) throw new Error(result.error || 'Error al obtener la lista de precios');
                if (isMounted) setData(result.data || []);
            } catch (err: any) {
                if (isMounted) {
                    setError(err.message);
                    setData([]);
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData();
        return () => { isMounted = false; };
    }, [zonaId]);

    // Fetch history for selected row
    const fetchHistory = async (codigo: string) => {
        if (!zonaId) return;
        setLoadingHistory(true);
        setHistoryError(null);
        try {
            const response = await fetch(`/api/precios/historial?zonaId=${zonaId}&codigo=${encodeURIComponent(codigo)}&years=${historyYears}`);
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Error al obtener historial');
            setHistory(result.data || []);
        } catch (err: any) {
            setHistoryError(err.message);
            setHistory([]);
        } finally {
            setLoadingHistory(false);
        }
    };

    // Trigger history reload when row or years parameter changes
    useEffect(() => {
        if (selectedRow) {
            fetchHistory(selectedRow.Codigo);
        }
    }, [selectedRow, historyYears]);

    const handleParamChange = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set(key, value);
        else params.delete(key);
        router.push(`?${params.toString()}`, { scroll: false });
    };

    const filteredData = useMemo(() => {
        const term = search.trim().toLowerCase();
        const result = data.filter(r =>
            term === '' ||
            (r.Descripcion || '').toLowerCase().includes(term) ||
            (r.Codigo || '').toLowerCase().includes(term)
        );

        return [...result].sort((a: any, b: any) => {
            const valA = a[sortConfig.key];
            const valB = b[sortConfig.key];
            if (valA === valB) return 0;
            if (valA === null || valA === undefined) return 1;
            if (valB === null || valB === undefined) return -1;

            if (!TEXT_KEYS.includes(sortConfig.key)) {
                const numA = Number(valA);
                const numB = Number(valB);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
                }
            }

            const sa = String(valA).toLowerCase();
            const sb = String(valB).toLowerCase();
            if (sa < sb) return sortConfig.direction === 'asc' ? -1 : 1;
            if (sa > sb) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [data, search, sortConfig]);

    const handleSort = (key: string) => {
        setSortConfig(prev => {
            if (prev.key === key) return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            return { key, direction: TEXT_KEYS.includes(key) ? 'asc' : 'desc' };
        });
    };

    const formatCurrency = (val: any) => {
        const num = Number(val);
        if (val === null || val === undefined || isNaN(num)) return '—';
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
    };

    const formatShortDate = (val: any) => {
        if (!val) return '—';
        try {
            return new Date(val).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return String(val);
        }
    };

    const zonaLabel = zonas.find(z => String(z.id) === zonaId)?.name || '';

    const handleExportExcel = () => {
        if (filteredData.length === 0) return;
        const ws = buildFormattedSheet({
            title: 'Lista de Precios',
            meta: [
                { label: 'Zona:', value: zonaLabel },
                { label: 'Búsqueda:', value: search.trim() || 'Sin filtro' },
                { label: 'Artículos listados:', value: String(filteredData.length) },
                { label: 'Generado:', value: new Date().toLocaleString('es-MX') }
            ],
            columns: [
                { header: '#', key: '_idx', width: 6, align: 'center', isNumber: true },
                { header: 'Código', key: 'Codigo', width: 16 },
                { header: 'Descripción', key: 'Descripcion', width: 46 },
                { header: 'Costo', key: 'Costo', width: 14, isCurrency: true, align: 'right' },
                { header: 'Público', key: 'PrecioPublico', width: 14, isCurrency: true, align: 'right' },
                { header: 'Profesor', key: 'PrecioProfesor', width: 14, isCurrency: true, align: 'right' },
                { header: 'Distribuidor', key: 'PrecioDistribuidor', width: 14, isCurrency: true, align: 'right' },
                { header: 'Distribuidor Especial', key: 'DistribuidoEspecial', width: 20, isCurrency: true, align: 'right' },
                { header: 'Último Cambio', key: 'FechaCambioPrecio', width: 16, align: 'center' }
            ],
            rows: filteredData.map((r, i) => ({
                _idx: i + 1,
                Codigo: r.Codigo,
                Descripcion: r.Descripcion,
                Costo: r.Costo,
                PrecioPublico: r.PrecioPublico,
                PrecioProfesor: r.PrecioProfesor,
                PrecioDistribuidor: r.PrecioDistribuidor,
                DistribuidoEspecial: r.DistribuidoEspecial,
                FechaCambioPrecio: formatShortDate(r.FechaCambioPrecio)
            }))
        });

        downloadXLSX(
            `Lista_de_Precios_${safeFileName(zonaLabel)}.xlsx`,
            [{ name: 'Precios', ws }]
        );
    };

    const handleExportPDF = () => {
        if (filteredData.length === 0) return;
        const doc = new jsPDF({ orientation: 'landscape' });

        doc.setFontSize(18);
        doc.setTextColor(30, 41, 59);
        doc.text('Lista de Precios', 14, 20);
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text(`Zona: ${zonaLabel}   |   Artículos: ${filteredData.length}`, 14, 28);
        doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, 33);

        autoTable(doc, {
            head: [["Código", "Descripción", "Costo", "Público", "Profesor", "Distribuidor", "Dist. Especial", "Último Cambio"]],
            body: filteredData.map(row => [
                row.Codigo,
                row.Descripcion,
                formatCurrency(row.Costo),
                formatCurrency(row.PrecioPublico),
                formatCurrency(row.PrecioProfesor),
                formatCurrency(row.PrecioDistribuidor),
                formatCurrency(row.DistribuidoEspecial),
                formatShortDate(row.FechaCambioPrecio)
            ]),
            startY: 40,
            theme: 'striped',
            headStyles: { fillColor: [37, 99, 235] },
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: {
                2: { halign: 'right' },
                3: { halign: 'right' },
                4: { halign: 'right' },
                5: { halign: 'right' },
                6: { halign: 'right' },
                7: { halign: 'center' }
            }
        });

        doc.save(`Lista_de_Precios_${safeFileName(zonaLabel)}.pdf`);
    };

    const handleOpenEdit = (row: PrecioRow) => {
        setSelectedRow(row);
        setEditPrices({
            p1: row.PrecioPublico?.toString() || '0',
            p2: row.PrecioProfesor?.toString() || '0',
            p3: row.PrecioDistribuidor?.toString() || '0',
            p4: row.DistribuidoEspecial?.toString() || '0'
        });
        setSaveSuccess(false);
        setSaveError(null);
        setIsDrawerOpen(true);
    };

    const handleSavePrices = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedRow) return;

        setSaving(true);
        setSaveError(null);
        setSaveSuccess(false);

        try {
            const response = await fetch('/api/precios/editar', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    zonaId: Number(zonaId),
                    codigo: selectedRow.Codigo,
                    precioPublico: Number(editPrices.p1),
                    precioProfesor: Number(editPrices.p2),
                    precioDistribuidor: Number(editPrices.p3),
                    distribuidoEspecial: Number(editPrices.p4)
                })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Error al guardar precios');

            setSaveSuccess(true);

            // Update local table data
            setData(prev =>
                prev.map(item =>
                    item.Codigo === selectedRow.Codigo
                        ? {
                            ...item,
                            PrecioPublico: Number(editPrices.p1),
                            PrecioProfesor: Number(editPrices.p2),
                            PrecioDistribuidor: Number(editPrices.p3),
                            DistribuidoEspecial: Number(editPrices.p4),
                            FechaCambioPrecio: new Date().toISOString()
                        }
                        : item
                )
            );
        } catch (err: any) {
            setSaveError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const renderPriceDiff = (newVal: string, originalVal: number | null) => {
        const numNew = Number(newVal);
        const numOrig = Number(originalVal) || 0;
        if (isNaN(numNew) || numNew === numOrig) return null;
        const diff = numNew - numOrig;
        const pct = numOrig > 0 ? (diff / numOrig) * 100 : 0;
        const sign = diff > 0 ? '+' : '';
        const color = diff > 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold';
        return (
            <span className={cn("text-[10px] ml-2 font-mono bg-slate-50 px-1 rounded border border-slate-100", color)}>
                {sign}{formatCurrency(diff)} ({sign}{pct.toFixed(1)}%)
            </span>
        );
    };

    const priceColumns: { key: string; label: string }[] = [
        { key: 'Costo', label: 'Costo' },
        { key: 'PrecioPublico', label: 'Público' },
        { key: 'PrecioProfesor', label: 'Profesor' },
        { key: 'PrecioDistribuidor', label: 'Distribuidor' },
        { key: 'DistribuidoEspecial', label: 'Dist. Especial' }
    ];

    return (
        <div className="space-y-6 relative">
            {/* Header + filtros */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white py-4 px-6 rounded-2xl shadow-sm border border-slate-100 animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3 select-none">
                        <Tags className="text-blue-600" />
                        Lista de Precios
                    </h1>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                        <MapPin size={16} className="text-blue-500" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Zona</span>
                        <select
                            value={zonaId}
                            onChange={(e) => handleParamChange('zonaId', e.target.value)}
                            className="bg-transparent text-xs font-bold text-slate-700 outline-none border-none cursor-pointer max-w-[220px]"
                        >
                            <option value="">Selecciona una zona</option>
                            {zonas.map(z => (
                                <option key={z.id} value={z.id}>{z.name}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={() => handleParamChange('zonaId', zonaId)}
                        className="p-2.5 bg-slate-50 border border-slate-200 text-blue-600 hover:bg-slate-100 hover:border-slate-300 transition-all rounded-xl shadow-sm disabled:opacity-40"
                        disabled={loading || !zonaId}
                        title="Actualizar Datos"
                    >
                        <RefreshCcw size={16} className={cn(loading && "animate-spin")} />
                    </button>
                    <button
                        onClick={handleExportExcel}
                        disabled={loading || filteredData.length === 0}
                        className="p-2.5 text-green-600 bg-green-50 hover:bg-green-100 rounded-xl transition-colors border border-green-200 disabled:opacity-40 pointer-events-auto"
                        title="Exportar Excel"
                    >
                        <FileSpreadsheet size={16} />
                    </button>
                    <button
                        onClick={handleExportPDF}
                        disabled={loading || filteredData.length === 0}
                        className="p-2.5 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors border border-rose-200 disabled:opacity-40 pointer-events-auto"
                        title="Exportar PDF"
                    >
                        <FileText size={16} />
                    </button>
                </div>
            </div>

            {zonasError && (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 px-5 py-3 rounded-2xl text-sm font-semibold">
                    No se pudo cargar el catálogo de zonas: {zonasError}
                </div>
            )}

            {/* Contenido */}
            {!zonaId ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center p-12 text-center text-slate-400 min-h-[400px]">
                    <MapPin size={48} className="text-blue-500 opacity-40 mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900">Selecciona una zona</h3>
                    <p className="mt-1 max-w-xs">Elige una zona para ver los precios vigentes de los artículos activos.</p>
                </div>
            ) : loading ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <Loader2 className="animate-spin mb-4 text-blue-600" size={40} />
                    <p className="font-medium">Cargando lista de precios...</p>
                </div>
            ) : error ? (
                <div className="bg-red-50 border border-red-200 text-red-600 p-6 rounded-2xl flex flex-col items-center">
                    <p className="font-bold">Error al cargar datos</p>
                    <p className="text-sm mt-1">{error}</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    {/* Toolbar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/60">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                            <Package size={16} className="text-blue-600" />
                            {filteredData.length} artículo{filteredData.length === 1 ? '' : 's'}
                            {zonaLabel && <span className="text-[11px] font-semibold text-slate-400 ml-1 uppercase tracking-wider">{zonaLabel}</span>}
                        </div>
                        <div className="relative flex items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-500/10 focus-within:border-blue-500 transition-all w-full sm:w-72">
                            <Search size={15} className="text-slate-400 mr-2 shrink-0" />
                            <input
                                type="text"
                                placeholder="Buscar por descripción o código..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="bg-transparent text-xs font-semibold text-slate-700 outline-none p-0 border-none h-auto w-full"
                            />
                            {search && (
                                <button onClick={() => setSearch('')} className="p-1 hover:bg-slate-200/60 rounded-full text-slate-400">
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="overflow-auto max-h-[68vh] nice-scroll">
                        <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
                            <thead className="bg-slate-50 sticky top-0 shadow-sm z-10 border-b border-slate-200">
                                <tr>
                                    <th
                                        className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group"
                                        onClick={() => handleSort('Codigo')}
                                    >
                                        <div className="flex items-center gap-1 justify-between">
                                            Código
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig.key === 'Codigo' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th
                                        className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group"
                                        onClick={() => handleSort('Descripcion')}
                                    >
                                        <div className="flex items-center gap-1 justify-between">
                                            Descripción
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig.key === 'Descripcion' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    {priceColumns.map(col => (
                                        <th
                                            key={col.key}
                                            className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group text-right"
                                            onClick={() => handleSort(col.key)}
                                        >
                                            <div className="flex items-center gap-1 justify-end">
                                                {col.label}
                                                <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig.key === col.key && "opacity-100 text-blue-500")} />
                                            </div>
                                        </th>
                                    ))}
                                    <th
                                        className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group text-center"
                                        onClick={() => handleSort('FechaCambioPrecio')}
                                    >
                                        <div className="flex items-center gap-1 justify-center">
                                            Último Cambio
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig.key === 'FechaCambioPrecio' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider text-center select-none">
                                        Acciones
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                                            {data.length === 0
                                                ? 'La zona seleccionada no tiene precios registrados.'
                                                : 'Ningún artículo coincide con la búsqueda.'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredData.map((row, idx) => (
                                        <tr key={`${row.Codigo}-${idx}`} className="hover:bg-blue-50/50 transition-colors group">
                                            <td className="px-6 py-3.5 font-mono text-xs font-bold text-slate-500">
                                                <div className="flex items-center gap-2">
                                                    <Tag size={12} className="text-slate-300 group-hover:text-blue-400 transition-colors" />
                                                    {row.Codigo}
                                                </div>
                                            </td>
                                            <td className="px-6 py-3.5 font-medium text-slate-900 group-hover:text-blue-600 transition-colors max-w-[420px] truncate" title={row.Descripcion}>
                                                {row.Descripcion}
                                            </td>
                                            <td className="px-6 py-3.5 text-right text-slate-500 tabular-nums">{formatCurrency(row.Costo)}</td>
                                            <td className="px-6 py-3.5 text-right font-bold text-blue-600 tabular-nums">{formatCurrency(row.PrecioPublico)}</td>
                                            <td className="px-6 py-3.5 text-right text-slate-700 tabular-nums">{formatCurrency(row.PrecioProfesor)}</td>
                                            <td className="px-6 py-3.5 text-right text-slate-700 tabular-nums">{formatCurrency(row.PrecioDistribuidor)}</td>
                                            <td className="px-6 py-3.5 text-right text-slate-700 tabular-nums">{formatCurrency(row.DistribuidoEspecial)}</td>
                                            <td className="px-6 py-3.5 text-center text-slate-600 text-xs tabular-nums">{formatShortDate(row.FechaCambioPrecio)}</td>
                                            <td className="px-6 py-3.5 text-center">
                                                <button
                                                    onClick={() => handleOpenEdit(row)}
                                                    className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1 text-xs font-bold"
                                                    title="Editar Precios"
                                                >
                                                    <Edit size={13} />
                                                    <span>Editar</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Slide-over Edit Drawer (Panel Deslizable) */}
            <div
                className={cn(
                    "fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300 z-50",
                    isDrawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
                onClick={() => setIsDrawerOpen(false)}
            />

            <div
                className={cn(
                    "fixed top-0 right-0 h-screen w-full sm:w-[480px] bg-white shadow-2xl z-50 border-l border-slate-100 flex flex-col transition-transform duration-300 ease-out transform",
                    isDrawerOpen ? "translate-x-0" : "translate-x-full"
                )}
            >
                {/* Header */}
                <div className="p-6 border-b border-slate-150 flex items-center justify-between bg-slate-50/70 select-none">
                    <div>
                        <span className="text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-200/50 px-2 py-0.5 rounded uppercase tracking-wider">
                            Gestión de Precios
                        </span>
                        <h2 className="text-base font-bold text-slate-900 mt-1.5 truncate max-w-[340px]" title={selectedRow?.Descripcion}>
                            {selectedRow?.Descripcion}
                        </h2>
                        <div className="flex items-center gap-4 text-xs font-semibold text-slate-450 mt-1">
                            <span>Código: <span className="font-mono text-slate-700 font-bold">{selectedRow?.Codigo}</span></span>
                            <span>Zona: <span className="text-slate-700 font-bold uppercase">{zonaLabel}</span></span>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsDrawerOpen(false)}
                        className="p-1.5 hover:bg-slate-200/80 rounded-full text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body - scrollable */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 nice-scroll">
                    {/* Cost Card */}
                    <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 flex items-center justify-between select-none">
                        <div className="flex items-center gap-2">
                            <Info size={14} className="text-slate-400" />
                            <span className="text-xs font-bold text-slate-500 uppercase">Costo Base</span>
                        </div>
                        <span className="font-mono text-sm font-black text-slate-700">{formatCurrency(selectedRow?.Costo)}</span>
                    </div>

                    <form onSubmit={handleSavePrices} className="space-y-4">
                        <div className="space-y-3.5">
                            {/* Precio Público */}
                            <div>
                                <label className="text-xs font-bold text-slate-650 uppercase tracking-wider block mb-1">
                                    Precio Público
                                    {renderPriceDiff(editPrices.p1, selectedRow?.PrecioPublico || null)}
                                </label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-xs font-bold">$</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={editPrices.p1}
                                        onChange={(e) => setEditPrices(prev => ({ ...prev, p1: e.target.value }))}
                                        className="block w-full pl-7 pr-3 py-2 bg-white border border-slate-250 rounded-xl text-slate-800 font-bold text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all hover:border-slate-350"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Precio Profesor */}
                            <div>
                                <label className="text-xs font-bold text-slate-650 uppercase tracking-wider block mb-1">
                                    Precio Profesor
                                    {renderPriceDiff(editPrices.p2, selectedRow?.PrecioProfesor || null)}
                                </label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-xs font-bold">$</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={editPrices.p2}
                                        onChange={(e) => setEditPrices(prev => ({ ...prev, p2: e.target.value }))}
                                        className="block w-full pl-7 pr-3 py-2 bg-white border border-slate-250 rounded-xl text-slate-800 font-bold text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all hover:border-slate-350"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Precio Distribuidor */}
                            <div>
                                <label className="text-xs font-bold text-slate-650 uppercase tracking-wider block mb-1">
                                    Precio Distribuidor
                                    {renderPriceDiff(editPrices.p3, selectedRow?.PrecioDistribuidor || null)}
                                </label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-xs font-bold">$</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={editPrices.p3}
                                        onChange={(e) => setEditPrices(prev => ({ ...prev, p3: e.target.value }))}
                                        className="block w-full pl-7 pr-3 py-2 bg-white border border-slate-250 rounded-xl text-slate-800 font-bold text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all hover:border-slate-350"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Distribuidor Especial */}
                            <div>
                                <label className="text-xs font-bold text-slate-650 uppercase tracking-wider block mb-1">
                                    Precio Distribuidor Especial (Dist. Especial)
                                    {renderPriceDiff(editPrices.p4, selectedRow?.DistribuidoEspecial || null)}
                                </label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-xs font-bold">$</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={editPrices.p4}
                                        onChange={(e) => setEditPrices(prev => ({ ...prev, p4: e.target.value }))}
                                        className="block w-full pl-7 pr-3 py-2 bg-white border border-slate-250 rounded-xl text-slate-800 font-bold text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all hover:border-slate-350"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        {saveError && (
                            <div className="bg-red-50 border border-red-200 text-red-650 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide">
                                {saveError}
                            </div>
                        )}

                        {saveSuccess && (
                            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-ping" />
                                Precios guardados exitosamente
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={saving}
                            className="w-full py-3 bg-slate-900 hover:bg-slate-850 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                        >
                            {saving ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" />
                                    <span>Guardando...</span>
                                </>
                            ) : (
                                <span>Guardar Cambios</span>
                            )}
                        </button>
                    </form>

                    <div className="w-full h-px bg-slate-100 my-2" />

                    {/* History Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between select-none">
                            <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                <Clock size={14} className="text-blue-500" />
                                Historial de Cambios
                            </h3>
                            <div className="flex items-center gap-1 border border-slate-200 rounded-lg p-0.5 bg-slate-50/50">
                                <span className="text-[9px] font-bold text-slate-400 uppercase px-1">Rango</span>
                                <select
                                    value={historyYears}
                                    onChange={(e) => setHistoryYears(Number(e.target.value))}
                                    className="bg-transparent text-[10px] font-bold text-slate-750 outline-none cursor-pointer border-none"
                                >
                                    <option value={1}>1 año</option>
                                    <option value={2}>2 años</option>
                                    <option value={3}>3 años</option>
                                    <option value={5}>5 años</option>
                                </select>
                            </div>
                        </div>

                        {loadingHistory ? (
                            <div className="flex flex-col items-center py-8 text-slate-450 text-xs">
                                <Loader2 className="animate-spin mb-2 text-blue-600" size={24} />
                                <span>Cargando auditoría de cambios...</span>
                            </div>
                        ) : historyError ? (
                            <p className="text-xs text-rose-500 bg-rose-50 p-3 rounded-lg font-semibold">{historyError}</p>
                        ) : history.length === 0 ? (
                            <div className="text-center py-6 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                                <Info size={24} className="mx-auto text-slate-300 mb-1.5" />
                                <p className="text-xs font-semibold">Sin cambios de precio registrados</p>
                                <p className="text-[10px] mt-0.5">No se encontraron actualizaciones en el rango seleccionado.</p>
                            </div>
                        ) : (
                            <div className="relative pl-1 space-y-4">
                                {history.map((h, hIdx) => {
                                    const changes = [];
                                    if (Number(h.Precio1) !== Number(h.PrecioAnt1)) {
                                        changes.push({ label: 'Público', from: h.PrecioAnt1, to: h.Precio1 });
                                    }
                                    if (Number(h.Precio2) !== Number(h.PrecioAnt2)) {
                                        changes.push({ label: 'Profesor', from: h.PrecioAnt2, to: h.Precio2 });
                                    }
                                    if (Number(h.Precio3) !== Number(h.PrecioAnt3)) {
                                        changes.push({ label: 'Distribuidor', from: h.PrecioAnt3, to: h.Precio3 });
                                    }
                                    if (Number(h.Precio4) !== Number(h.PrecioAnt4)) {
                                        changes.push({ label: 'Dist. Especial', from: h.PrecioAnt4, to: h.Precio4 });
                                    }

                                    return (
                                        <div key={hIdx} className="relative pl-6 pb-4 last:pb-0 border-l border-slate-150 last:border-none">
                                            {/* Timeline dot */}
                                            <span className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-blue-600 border border-white -translate-x-[4.5px] shadow-sm" />
                                            
                                            <div className="flex items-center justify-between text-[10px] text-slate-450 font-bold mb-1.5">
                                                <span className="flex items-center gap-1">
                                                    <Clock size={11} className="text-slate-400" />
                                                    {formatShortDate(h.FechaAct)} {new Date(h.FechaAct).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                {h.Cambio === 1 && (
                                                    <span className="text-[8px] uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-100 px-1 py-0.5 rounded font-black select-none">
                                                        Auditoría
                                                    </span>
                                                )}
                                            </div>

                                            {changes.length === 0 ? (
                                                <p className="text-xs text-slate-500 italic">Registro base de precios de lista (inicial o sin variación)</p>
                                            ) : (
                                                <div className="space-y-1.5">
                                                    {changes.map((c, cIdx) => {
                                                        const diff = c.to - c.from;
                                                        const isUp = diff > 0;
                                                        return (
                                                            <div key={cIdx} className="text-[11px] flex items-center justify-between text-slate-750 bg-slate-50/50 p-2 rounded-xl border border-slate-100 shadow-3xs">
                                                                <span className="font-bold text-slate-600">{c.label}</span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-slate-400 line-through font-mono">{formatCurrency(c.from)}</span>
                                                                    <span className="text-slate-400">→</span>
                                                                    <span className="font-black text-slate-800 font-mono">{formatCurrency(c.to)}</span>
                                                                    <span className={cn(
                                                                        "flex items-center text-[9px] font-black px-1 py-0.5 rounded font-mono ml-0.5",
                                                                        isUp ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"
                                                                    )}>
                                                                        {isUp ? <TrendingUp size={9} className="mr-0.5" /> : <TrendingDown size={9} className="mr-0.5" />}
                                                                        {formatCurrency(diff)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function ListaPreciosPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin text-blue-600" size={40} />
            </div>
        }>
            <ListaPreciosContent />
        </Suspense>
    );
}
