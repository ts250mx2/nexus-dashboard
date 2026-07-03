'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
    BarChart3,
    Loader2,
    Search,
    Store,
    Plus,
    X,
    RefreshCcw,
    FileSpreadsheet,
    FileText,
    CalendarDays,
    CalendarRange,
    ArrowUpDown,
    TrendingUp,
    TrendingDown,
    Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildFormattedSheet, downloadXLSX, safeFileName } from '@/lib/excel-helpers';

type Mode = 'ytd' | 'full';

const METRICS = [
    { key: 'Cantidad', label: 'Cant.' },
    { key: 'Ticket', label: 'Tkt. Prom.' },
    { key: 'Total', label: 'Total' }
] as const;

// Tintes suaves por año para agrupar visualmente las tres métricas
const YEAR_TINTS = [
    { headBg: 'bg-blue-50 text-blue-700', cellBg: 'bg-blue-50/30', bar: 'bg-blue-500' },
    { headBg: 'bg-purple-50 text-purple-700', cellBg: 'bg-purple-50/30', bar: 'bg-purple-500' },
    { headBg: 'bg-emerald-50 text-emerald-700', cellBg: 'bg-emerald-50/30', bar: 'bg-emerald-500' },
    { headBg: 'bg-amber-50 text-amber-700', cellBg: 'bg-amber-50/30', bar: 'bg-amber-500' },
    { headBg: 'bg-rose-50 text-rose-700', cellBg: 'bg-rose-50/30', bar: 'bg-rose-500' },
    { headBg: 'bg-cyan-50 text-cyan-700', cellBg: 'bg-cyan-50/30', bar: 'bg-cyan-500' },
    { headBg: 'bg-indigo-50 text-indigo-700', cellBg: 'bg-indigo-50/30', bar: 'bg-indigo-500' },
    { headBg: 'bg-slate-100 text-slate-700', cellBg: 'bg-slate-50/40', bar: 'bg-slate-500' }
];

const MAX_YEARS = 8;
const MIN_YEAR = 2000;

// Anchos (px) de las columnas congeladas a la izquierda (panel fijo / "split")
const ID_W = 72;
const SOCIO_W_DEFAULT = 176;
const SOCIO_W_MIN = 96;
const SOCIO_W_MAX = 460;

export default function ComparativoProfesoresPage() {
    const currentYear = new Date().getFullYear();

    const [years, setYears] = useState<number[]>([currentYear, currentYear - 1]);
    const [mode, setMode] = useState<Mode>('ytd');

    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [sucursalFilter, setSucursalFilter] = useState<string>('all');
    const [search, setSearch] = useState('');

    // Ancho (movible) del panel congelado — la columna Socio. Durante el arrastre
    // se actualiza la variable CSS directamente (sin re-render) y se persiste al soltar.
    const [socioW, setSocioW] = useState(SOCIO_W_DEFAULT);
    const tableWrapRef = useRef<HTMLDivElement>(null);

    const startResize = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = socioW;
        let latest = startW;
        const onMove = (ev: MouseEvent) => {
            latest = Math.min(SOCIO_W_MAX, Math.max(SOCIO_W_MIN, startW + (ev.clientX - startX)));
            tableWrapRef.current?.style.setProperty('--socio-w', `${latest}px`);
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            setSocioW(latest);
        };
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: `Total_${currentYear}`, direction: 'desc' });

    const yearsKey = years.join(',');

    useEffect(() => {
        if (years.length === 0) return;
        let isMounted = true;
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const url = `/api/reportes/comparativo-profesores?years=${yearsKey}&mode=${mode}`;
                const response = await fetch(url);
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Error al obtener el comparativo');
                if (isMounted) setData(result.data || []);
            } catch (err: any) {
                if (isMounted) setError(err.message);
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        fetchData();
        return () => { isMounted = false; };
    }, [yearsKey, mode]);

    // Años ordenados de más reciente a más antiguo (para columnas)
    const sortedYears = useMemo(() => [...years].sort((a, b) => b - a), [years]);

    const addOlderYear = () => {
        setYears(prev => {
            if (prev.length >= MAX_YEARS) return prev;
            const next = Math.min(...prev) - 1;
            if (next < MIN_YEAR || prev.includes(next)) return prev;
            return [...prev, next].sort((a, b) => b - a);
        });
    };

    const removeYear = (y: number) => {
        setYears(prev => (prev.length <= 1 ? prev : prev.filter(v => v !== y)));
    };

    const resetYears = () => setYears([currentYear, currentYear - 1]);

    // Opciones de sucursal derivadas de los datos
    const sucursalOptions = useMemo(() => {
        const map = new Map<string, string>();
        data.forEach(r => map.set(String(r.IdSucursal), r.Sucursal));
        return Array.from(map.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [data]);

    const num = (v: any) => Number(v) || 0;
    const ticket = (row: any, y: number) => {
        const c = num(row[`Cantidad_${y}`]);
        return c > 0 ? num(row[`Total_${y}`]) / c : null;
    };

    const getSortValue = (row: any, key: string): number | string => {
        if (key.startsWith('Ticket_')) {
            const y = Number(key.slice(7));
            return ticket(row, y) ?? -1;
        }
        if (key.startsWith('Cantidad_') || key.startsWith('Total_')) {
            return num(row[key]);
        }
        const v = row[key];
        return v === null || v === undefined ? '' : v;
    };

    const filteredData = useMemo(() => {
        let result = data.filter(r =>
            (sucursalFilter === 'all' || String(r.IdSucursal) === sucursalFilter) &&
            (r.Socio || '').toLowerCase().includes(search.toLowerCase())
        );

        result = [...result].sort((a, b) => {
            const va = getSortValue(a, sortConfig.key);
            const vb = getSortValue(b, sortConfig.key);
            if (typeof va === 'number' && typeof vb === 'number') {
                return sortConfig.direction === 'asc' ? va - vb : vb - va;
            }
            const sa = String(va).toLowerCase();
            const sb = String(vb).toLowerCase();
            if (sa < sb) return sortConfig.direction === 'asc' ? -1 : 1;
            if (sa > sb) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return result;
    }, [data, sucursalFilter, search, sortConfig]);

    const handleSort = (key: string) => {
        setSortConfig(prev => {
            if (prev.key === key) return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            return { key, direction: 'desc' };
        });
    };

    const formatCurrency = (val: any) => {
        const n = Number(val);
        if (isNaN(n)) return '—';
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
    };
    const formatInt = (val: any) => new Intl.NumberFormat('es-MX').format(Number(val) || 0);

    // Totales por año para el pie de tabla
    const totals = useMemo(() => {
        const t: Record<number, { cantidad: number; total: number }> = {};
        for (const y of sortedYears) t[y] = { cantidad: 0, total: 0 };
        for (const r of filteredData) {
            for (const y of sortedYears) {
                t[y].cantidad += num(r[`Cantidad_${y}`]);
                t[y].total += num(r[`Total_${y}`]);
            }
        }
        return t;
    }, [filteredData, sortedYears]);

    const modeLabel = mode === 'ytd'
        ? `Hasta hoy (${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}) de cada año`
        : 'Año completo';

    // Variación % de Total contra el año inmediatamente anterior seleccionado
    const variance = (row: any, yi: number): number | null => {
        const older = sortedYears[yi + 1];
        if (older === undefined) return null;
        const prevTotal = num(row[`Total_${older}`]);
        if (prevTotal === 0) return null;
        return (num(row[`Total_${sortedYears[yi]}`]) - prevTotal) / prevTotal * 100;
    };

    const handleExportExcel = () => {
        if (filteredData.length === 0) return;
        const columns: any[] = [
            { header: 'IdSocio', key: 'IdSocio', width: 10, isNumber: true, align: 'center' },
            { header: 'Socio', key: 'Socio', width: 34 },
            { header: 'Sucursal', key: 'Sucursal', width: 22 },
            { header: 'Teléfono', key: 'Telefono', width: 16 },
            { header: 'Dirección', key: 'Direccion', width: 40 },
            { header: 'Correo', key: 'Correo', width: 30 },
            { header: 'Disciplina', key: 'Disciplina', width: 22 }
        ];
        for (const y of sortedYears) {
            columns.push({ header: `Cant. ${y}`, key: `Cantidad_${y}`, width: 10, isNumber: true, align: 'right' });
            columns.push({ header: `Tkt. Prom. ${y}`, key: `Ticket_${y}`, width: 15, isCurrency: true, align: 'right' });
            columns.push({ header: `Total ${y}`, key: `Total_${y}`, width: 16, isCurrency: true, align: 'right' });
        }

        const rows = filteredData.map(r => {
            const base: any = {
                IdSocio: r.IdSocio,
                Socio: r.Socio,
                Sucursal: r.Sucursal,
                Telefono: r.Telefono || '—',
                Direccion: r.Direccion || '—',
                Correo: r.Correo || '—',
                Disciplina: r.Disciplina || '—'
            };
            for (const y of sortedYears) {
                const c = num(r[`Cantidad_${y}`]);
                base[`Cantidad_${y}`] = c;
                base[`Ticket_${y}`] = c > 0 ? num(r[`Total_${y}`]) / c : 0;
                base[`Total_${y}`] = num(r[`Total_${y}`]);
            }
            return base;
        });

        const totalValues: any = {};
        for (const y of sortedYears) {
            totalValues[`Cantidad_${y}`] = totals[y].cantidad;
            totalValues[`Total_${y}`] = totals[y].total;
            totalValues[`Ticket_${y}`] = totals[y].cantidad > 0 ? totals[y].total / totals[y].cantidad : 0;
        }

        const ws = buildFormattedSheet({
            title: 'Comparativo de Profesores por Año',
            meta: [
                { label: 'Años:', value: sortedYears.join(' · ') },
                { label: 'Modo:', value: modeLabel },
                { label: 'Sucursal:', value: sucursalFilter === 'all' ? 'Todas' : (sucursalOptions.find(s => s.id === sucursalFilter)?.name || sucursalFilter) },
                { label: 'Profesores:', value: String(filteredData.length) },
                { label: 'Generado:', value: new Date().toLocaleString('es-MX') }
            ],
            columns,
            rows,
            totalRow: { label: 'TOTAL', values: totalValues }
        });

        downloadXLSX(`Comparativo_Profesores_${sortedYears.join('-')}_${mode}.xlsx`, [{ name: 'Comparativo', ws }]);
    };

    const handleExportPDF = () => {
        if (filteredData.length === 0) return;
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(16);
        doc.text('Comparativo de Profesores por Año', 14, 16);
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text(`Años: ${sortedYears.join(' · ')}   |   Modo: ${modeLabel}   |   Generado: ${new Date().toLocaleString()}`, 14, 22);

        const head = [['IdSocio', 'Socio', 'Sucursal', 'Disciplina', ...sortedYears.flatMap(y => [`Cant. ${y}`, `Tkt. ${y}`, `Total ${y}`])]];
        const body = filteredData.map(r => {
            const cells = [String(r.IdSocio), r.Socio, r.Sucursal, r.Disciplina || '—'];
            for (const y of sortedYears) {
                const c = num(r[`Cantidad_${y}`]);
                cells.push(formatInt(c));
                cells.push(c > 0 ? formatCurrency(num(r[`Total_${y}`]) / c) : '—');
                cells.push(formatCurrency(num(r[`Total_${y}`])));
            }
            return cells;
        });

        autoTable(doc, {
            head,
            body,
            startY: 27,
            theme: 'striped',
            headStyles: { fillColor: [37, 99, 235], fontSize: 7 },
            styles: { fontSize: 7, cellPadding: 1.8 }
        });
        doc.save(`Comparativo_Profesores_${sortedYears.join('-')}_${mode}.pdf`);
    };

    const identityCols: { key: string; label: string; className?: string }[] = [
        { key: 'IdSocio', label: 'IdSocio', className: 'text-center' },
        { key: 'Socio', label: 'Socio' },
        { key: 'Sucursal', label: 'Sucursal' },
        { key: 'Telefono', label: 'Teléfono' },
        { key: 'Direccion', label: 'Dirección' },
        { key: 'Correo', label: 'Correo' },
        { key: 'Disciplina', label: 'Disciplina' }
    ];

    return (
        <div className="space-y-6">
            {/* Header + controls */}
            <div className="flex flex-col gap-4 bg-white py-4 px-6 rounded-2xl shadow-sm border border-slate-100 animate-in fade-in duration-500">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3 select-none">
                        <BarChart3 className="text-blue-600" />
                        Comparativo Profesores
                    </h1>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Mode toggle */}
                        <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1">
                            <button
                                onClick={() => setMode('ytd')}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                                    mode === 'ytd' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                )}
                                title="Comparar solo hasta la fecha actual de cada año"
                            >
                                <CalendarDays size={14} /> Hasta hoy
                            </button>
                            <button
                                onClick={() => setMode('full')}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                                    mode === 'full' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                )}
                                title="Comparar el año completo"
                            >
                                <CalendarRange size={14} /> Año completo
                            </button>
                        </div>

                        <button
                            onClick={handleExportExcel}
                            disabled={loading || filteredData.length === 0}
                            className="p-2.5 text-green-600 bg-green-50 hover:bg-green-100 rounded-xl transition-colors border border-green-200 disabled:opacity-40"
                            title="Exportar Excel"
                        >
                            <FileSpreadsheet size={16} />
                        </button>
                        <button
                            onClick={handleExportPDF}
                            disabled={loading || filteredData.length === 0}
                            className="p-2.5 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors border border-rose-200 disabled:opacity-40"
                            title="Exportar PDF"
                        >
                            <FileText size={16} />
                        </button>
                    </div>
                </div>

                {/* Years + filters row */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-2 border-t border-slate-100">
                    {/* Year chips */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Años</span>
                        {sortedYears.map((y, yi) => {
                            const tint = YEAR_TINTS[yi % YEAR_TINTS.length];
                            return (
                                <span
                                    key={y}
                                    className={cn('flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg text-xs font-bold border', tint.headBg, 'border-slate-200')}
                                >
                                    {y}
                                    {years.length > 1 && (
                                        <button
                                            onClick={() => removeYear(y)}
                                            className="p-0.5 hover:bg-white/70 rounded-full transition-colors"
                                            title={`Quitar ${y}`}
                                        >
                                            <X size={11} />
                                        </button>
                                    )}
                                </span>
                            );
                        })}
                        {years.length < MAX_YEARS && Math.min(...years) - 1 >= MIN_YEAR && (
                            <button
                                onClick={addOlderYear}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-all active:scale-95"
                                title={`Agregar ${Math.min(...years) - 1}`}
                            >
                                <Plus size={13} /> Año
                            </button>
                        )}
                        <button
                            onClick={resetYears}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Restablecer a año actual vs anterior"
                            disabled={loading}
                        >
                            <RefreshCcw size={14} className={cn(loading && 'animate-spin')} />
                        </button>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                            <Store size={15} className="text-blue-500" />
                            <select
                                value={sucursalFilter}
                                onChange={(e) => setSucursalFilter(e.target.value)}
                                className="bg-transparent text-xs font-bold text-slate-700 outline-none border-none cursor-pointer max-w-[180px]"
                            >
                                <option value="all">Todas las sucursales</option>
                                {sucursalOptions.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500/10 focus-within:border-blue-500 transition-all w-full sm:w-64">
                            <Search size={15} className="text-slate-400 mr-2 shrink-0" />
                            <input
                                type="text"
                                placeholder="Buscar profesor..."
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
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <Loader2 className="animate-spin mb-4 text-blue-600" size={40} />
                    <p className="font-medium">Cargando comparativo...</p>
                </div>
            ) : error ? (
                <div className="bg-red-50 border border-red-200 text-red-600 p-6 rounded-2xl flex flex-col items-center">
                    <p className="font-bold">Error al cargar datos</p>
                    <p className="text-sm mt-1">{error}</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/60">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                            <Users size={16} className="text-blue-600" />
                            {filteredData.length} profesor{filteredData.length === 1 ? '' : 'es'}
                        </div>
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{modeLabel}</span>
                    </div>
                    <div ref={tableWrapRef} className="relative" style={{ '--socio-w': `${socioW}px` } as React.CSSProperties}>
                    <div className="overflow-auto max-h-[68vh] nice-scroll">
                        <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
                            <thead className="bg-white sticky top-0 z-30 shadow-sm">
                                <tr className="border-b border-slate-200">
                                    {/* Panel congelado: IdSocio */}
                                    <th
                                        onClick={() => handleSort('IdSocio')}
                                        style={{ left: 0, width: ID_W, minWidth: ID_W, maxWidth: ID_W }}
                                        className="sticky z-20 bg-white px-2 py-3 font-bold text-slate-600 text-[11px] uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors select-none group overflow-hidden"
                                    >
                                        <div className="flex items-center gap-1 justify-center">
                                            IdSocio
                                            <ArrowUpDown size={12} className={cn('text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity', sortConfig.key === 'IdSocio' && 'opacity-100 text-blue-500')} />
                                        </div>
                                    </th>
                                    {/* Panel congelado: Socio + línea divisoria (split) */}
                                    <th
                                        onClick={() => handleSort('Socio')}
                                        style={{ left: ID_W, width: 'var(--socio-w)', minWidth: 'var(--socio-w)', maxWidth: 'var(--socio-w)' }}
                                        className="sticky z-20 bg-white border-r-2 border-slate-300 shadow-[2px_0_5px_-2px_rgba(15,23,42,0.12)] px-3 py-3 font-bold text-slate-600 text-[11px] uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors select-none group"
                                    >
                                        <div className="flex items-center gap-1 justify-between">
                                            Socio
                                            <ArrowUpDown size={12} className={cn('text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity', sortConfig.key === 'Socio' && 'opacity-100 text-blue-500')} />
                                        </div>
                                    </th>
                                    {identityCols.slice(2).map(col => (
                                        <th
                                            key={col.key}
                                            onClick={() => handleSort(col.key)}
                                            className={cn(
                                                'px-4 py-3 font-bold text-slate-600 text-[11px] uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors select-none group',
                                                col.className
                                            )}
                                        >
                                            <div className={cn('flex items-center gap-1', col.className === 'text-center' ? 'justify-center' : 'justify-between')}>
                                                {col.label}
                                                <ArrowUpDown size={12} className={cn('text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity', sortConfig.key === col.key && 'opacity-100 text-blue-500')} />
                                            </div>
                                        </th>
                                    ))}
                                    {sortedYears.map((y, yi) => {
                                        const tint = YEAR_TINTS[yi % YEAR_TINTS.length];
                                        return METRICS.map(m => {
                                            const key = `${m.key}_${y}`;
                                            return (
                                                <th
                                                    key={key}
                                                    onClick={() => handleSort(key)}
                                                    className={cn('px-4 py-3 text-right font-bold text-[11px] uppercase tracking-wider cursor-pointer transition-colors select-none group border-l', tint.headBg, m.key === 'Cantidad' ? 'border-slate-200' : 'border-slate-100')}
                                                >
                                                    <div className="flex items-center gap-1 justify-end">
                                                        <span className="flex flex-col items-end leading-tight">
                                                            <span>{m.label}</span>
                                                            <span className="text-[9px] font-black opacity-70">{y}</span>
                                                        </span>
                                                        <ArrowUpDown size={12} className={cn('opacity-0 group-hover:opacity-100 transition-opacity', sortConfig.key === key && 'opacity-100')} />
                                                    </div>
                                                </th>
                                            );
                                        });
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan={identityCols.length + sortedYears.length * 3} className="px-6 py-14 text-center text-slate-400">
                                            No se encontraron profesores con ventas en los años seleccionados.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredData.map((r, idx) => (
                                        <tr key={idx} className="group hover:bg-blue-50/40 transition-colors">
                                            <td style={{ left: 0, width: ID_W, minWidth: ID_W, maxWidth: ID_W }} className="sticky z-20 bg-white group-hover:bg-blue-50/40 px-2 py-3 text-center text-slate-400 font-mono text-xs overflow-hidden">{r.IdSocio}</td>
                                            <td style={{ left: ID_W, width: 'var(--socio-w)', minWidth: 'var(--socio-w)', maxWidth: 'var(--socio-w)' }} title={r.Socio} className="sticky z-20 bg-white group-hover:bg-blue-50/40 border-r-2 border-slate-300 shadow-[2px_0_5px_-2px_rgba(15,23,42,0.12)] px-3 py-3 font-semibold text-slate-800 truncate">{r.Socio}</td>
                                            <td className="px-4 py-3 text-slate-500 italic text-xs">{r.Sucursal}</td>
                                            <td className="px-4 py-3 text-slate-500 text-xs tabular-nums">{r.Telefono || <span className="text-slate-300">—</span>}</td>
                                            <td className="px-4 py-3 text-slate-500 text-xs max-w-[220px] truncate" title={r.Direccion || ''}>{r.Direccion || <span className="text-slate-300">—</span>}</td>
                                            <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate" title={r.Correo || ''}>{r.Correo || <span className="text-slate-300">—</span>}</td>
                                            <td className="px-4 py-3 text-slate-600 text-xs">{r.Disciplina || <span className="text-slate-300">—</span>}</td>
                                            {sortedYears.map((y, yi) => {
                                                const tint = YEAR_TINTS[yi % YEAR_TINTS.length];
                                                const c = num(r[`Cantidad_${y}`]);
                                                const tk = ticket(r, y);
                                                const v = variance(r, yi);
                                                return (
                                                    <React.Fragment key={y}>
                                                        <td className={cn('px-4 py-3 text-right text-slate-700 font-medium tabular-nums border-l border-slate-200', tint.cellBg)}>
                                                            {c > 0 ? formatInt(c) : <span className="text-slate-300">0</span>}
                                                        </td>
                                                        <td className={cn('px-4 py-3 text-right text-slate-600 tabular-nums border-l border-slate-100', tint.cellBg)}>
                                                            {tk !== null ? formatCurrency(tk) : <span className="text-slate-300">—</span>}
                                                        </td>
                                                        <td className={cn('px-4 py-3 text-right font-bold text-slate-800 tabular-nums border-l border-slate-100', tint.cellBg)}>
                                                            <div className="flex flex-col items-end leading-tight">
                                                                <span>{c > 0 ? formatCurrency(num(r[`Total_${y}`])) : <span className="text-slate-300">—</span>}</span>
                                                                {v !== null && (
                                                                    <span className={cn('flex items-center gap-0.5 text-[10px] font-bold', v >= 0 ? 'text-emerald-600' : 'text-rose-500')}>
                                                                        {v >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                                                        {Math.abs(v).toFixed(0)}%
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {filteredData.length > 0 && (
                                <tfoot className="sticky bottom-0 z-30 bg-slate-50 border-t-2 border-slate-200">
                                    <tr className="font-bold text-slate-700">
                                        <td style={{ left: 0, width: ID_W, minWidth: ID_W, maxWidth: ID_W }} className="sticky z-20 bg-slate-50 px-2 py-3"></td>
                                        <td style={{ left: ID_W, width: 'var(--socio-w)', minWidth: 'var(--socio-w)', maxWidth: 'var(--socio-w)' }} className="sticky z-20 bg-slate-50 border-r-2 border-slate-300 shadow-[2px_0_5px_-2px_rgba(15,23,42,0.12)] px-3 py-3 text-xs uppercase tracking-wider text-slate-400 truncate">Totales ({filteredData.length})</td>
                                        <td className="px-4 py-3" colSpan={identityCols.length - 2}></td>
                                        {sortedYears.map((y, yi) => {
                                            const tint = YEAR_TINTS[yi % YEAR_TINTS.length];
                                            const tt = totals[y];
                                            const tavg = tt.cantidad > 0 ? tt.total / tt.cantidad : null;
                                            return (
                                                <React.Fragment key={y}>
                                                    <td className={cn('px-4 py-3 text-right tabular-nums border-l border-slate-200', tint.cellBg)}>{formatInt(tt.cantidad)}</td>
                                                    <td className={cn('px-4 py-3 text-right tabular-nums text-slate-500 border-l border-slate-100', tint.cellBg)}>{tavg !== null ? formatCurrency(tavg) : '—'}</td>
                                                    <td className={cn('px-4 py-3 text-right tabular-nums border-l border-slate-100', tint.cellBg)}>{formatCurrency(tt.total)}</td>
                                                </React.Fragment>
                                            );
                                        })}
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                        {/* Divisor movible del split: arrastra para ajustar el ancho del panel fijo */}
                        <div
                            onMouseDown={startResize}
                            style={{ left: `calc(${ID_W}px + var(--socio-w))` }}
                            className="absolute top-0 bottom-0 z-40 w-3 -ml-1.5 cursor-col-resize group flex items-center justify-center"
                            title="Arrastra para ajustar el ancho de la columna fija"
                        >
                            <div className="h-full w-0.5 bg-transparent group-hover:bg-blue-500/70 transition-colors" />
                            <div className="absolute top-1/2 -translate-y-1/2 h-8 w-1.5 rounded-full bg-slate-300 group-hover:bg-blue-500 shadow-sm transition-colors" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
