'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    X,
    Loader2,
    Store,
    Calendar,
    ChevronDown,
    ArrowRight,
    Package,
    RefreshCcw,
    FileText,
    PackageCheck,
    Truck,
    CheckCircle2,
    Ban,
    User,
    DollarSign,
    LayoutGrid,
    Hash,
    Search,
    Factory
} from 'lucide-react';
import { cn } from '@/lib/utils';
import DatePresets from '@/components/DatePresets';

type Etapa = 'ORDEN_CREADA' | 'ORDEN_RECIBIDA' | 'TRASPASO_ENVIADO' | 'TRASPASO_RECIBIDO' | 'CANCELADO';

interface Column {
    id: Etapa;
    title: string;
    subtitle: string;
    Icon: React.ElementType;
    ring: string;
    bar: string;
    badge: string;
    chip: string;
    iconBg: string;
}

const COLUMNS: Column[] = [
    {
        id: 'ORDEN_CREADA',
        title: 'Orden Creada',
        subtitle: 'Esperando recepción del proveedor',
        Icon: FileText,
        ring: 'ring-blue-200',
        bar: 'bg-blue-500',
        badge: 'bg-blue-100 text-blue-700 border-blue-200',
        chip: 'bg-blue-50 text-blue-700',
        iconBg: 'bg-blue-50 text-blue-600'
    },
    {
        id: 'ORDEN_RECIBIDA',
        title: 'Orden Recibida',
        subtitle: 'Mercancía en almacén central',
        Icon: PackageCheck,
        ring: 'ring-indigo-200',
        bar: 'bg-indigo-500',
        badge: 'bg-indigo-100 text-indigo-700 border-indigo-200',
        chip: 'bg-indigo-50 text-indigo-700',
        iconBg: 'bg-indigo-50 text-indigo-600'
    },
    {
        id: 'TRASPASO_ENVIADO',
        title: 'Traspaso Enviado',
        subtitle: 'En tránsito a sucursal destino',
        Icon: Truck,
        ring: 'ring-amber-200',
        bar: 'bg-amber-500',
        badge: 'bg-amber-100 text-amber-800 border-amber-200',
        chip: 'bg-amber-50 text-amber-700',
        iconBg: 'bg-amber-50 text-amber-600'
    },
    {
        id: 'TRASPASO_RECIBIDO',
        title: 'Traspaso Recibido',
        subtitle: 'Entregado en sucursal destino',
        Icon: CheckCircle2,
        ring: 'ring-emerald-200',
        bar: 'bg-emerald-500',
        badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        chip: 'bg-emerald-50 text-emerald-700',
        iconBg: 'bg-emerald-50 text-emerald-600'
    }
];

function getStepIndex(etapa: Etapa): number {
    const idx = COLUMNS.findIndex(c => c.id === etapa);
    return idx === -1 ? -1 : idx;
}

/** Fecha + usuario que pertenecen a cada etapa del pipeline (en orden). */
const STAGE_FIELDS: { id: Etapa; date: string; user: string; verb: string }[] = [
    { id: 'ORDEN_CREADA',      date: 'FechaOrdenCompra',    user: 'UsuarioOCCrea',         verb: 'Creó OC' },
    { id: 'ORDEN_RECIBIDA',    date: 'FechaReciboOC',       user: 'UsuarioOCRecibe',       verb: 'Recibió OC' },
    { id: 'TRASPASO_ENVIADO',  date: 'FechaTraspaso',       user: 'UsuarioTraspasoEnvio', verb: 'Envió traspaso' },
    { id: 'TRASPASO_RECIBIDO', date: 'FechaReciboTraspaso', user: 'UsuarioTraspasoRecibe', verb: 'Recibió traspaso' }
];

function getEtapaUser(row: any): string {
    if (row.Etapa === 'CANCELADO') return row.UsuarioCancelacion || row.UsuarioTraspaso || '-';
    const found = STAGE_FIELDS.find(s => s.id === row.Etapa);
    if (!found) return row.UsuarioTraspaso || '-';
    return row[found.user] || row.UsuarioTraspaso || '-';
}

function KanbanContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [sucursales, setSucursales] = useState<{ id: number; name: string }[]>([]);
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startDate = searchParams.get('startDate') || getFirstOfMonth();
    const endDate = searchParams.get('endDate') || getToday();
    const idTienda = searchParams.get('idTienda') || 'all';
    const includeCancelled = searchParams.get('cancelled') === '1';

    const [selectedTraspaso, setSelectedTraspaso] = useState<any | null>(null);
    const [detailItems, setDetailItems] = useState<any[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    const [searchQuery, setSearchQuery] = useState('');

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

    useEffect(() => {
        let isMounted = true;
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const url = `/api/compras/traspasos/kanban?startDate=${startDate}&endDate=${endDate}&idTienda=${idTienda}&includeCancelled=${includeCancelled ? '1' : '0'}`;
                const response = await fetch(url);
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Error al obtener kanban');
                if (isMounted) setData(result || []);
            } catch (err: any) {
                if (isMounted) setError(err.message);
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        fetchData();
        return () => { isMounted = false; };
    }, [startDate, endDate, idTienda, includeCancelled]);

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
                if (!response.ok) throw new Error(result.error || 'Error al obtener detalles');
                if (isMounted) setDetailItems(result || []);
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

    const filteredData = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return data;
        return data.filter(item => {
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
    }, [data, searchQuery]);

    const grouped = useMemo(() => {
        const map: Record<Etapa, any[]> = {
            ORDEN_CREADA: [],
            ORDEN_RECIBIDA: [],
            TRASPASO_ENVIADO: [],
            TRASPASO_RECIBIDO: [],
            CANCELADO: []
        };
        filteredData.forEach(row => {
            const e: Etapa = (row.Etapa || 'TRASPASO_ENVIADO') as Etapa;
            if (map[e]) map[e].push(row);
        });
        return map;
    }, [filteredData]);

    const totals = useMemo(() => {
        const result: Record<Etapa, { count: number; amount: number }> = {
            ORDEN_CREADA: { count: 0, amount: 0 },
            ORDEN_RECIBIDA: { count: 0, amount: 0 },
            TRASPASO_ENVIADO: { count: 0, amount: 0 },
            TRASPASO_RECIBIDO: { count: 0, amount: 0 },
            CANCELADO: { count: 0, amount: 0 }
        };
        filteredData.forEach(row => {
            const e: Etapa = (row.Etapa || 'TRASPASO_ENVIADO') as Etapa;
            if (result[e]) {
                result[e].count += 1;
                result[e].amount += Number(row.Total) || 0;
            }
        });
        return result;
    }, [filteredData]);

    const formatCurrency = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return val;
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
    };

    const formatCurrencyCompact = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return val;
        if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
        if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(num);
    };

    const formatShortDate = (val: string | null) => {
        if (!val) return '-';
        return new Date(val).toLocaleDateString('es-MX', {
            day: '2-digit',
            month: 'short'
        });
    };

    const selectedStepIdx = selectedTraspaso ? getStepIndex(selectedTraspaso.Etapa as Etapa) : -1;

    return (
        <div className="space-y-6 relative min-h-[calc(100vh-140px)]">
            {/* Header */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white py-4 px-6 rounded-2xl shadow-sm border border-slate-100 animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3 select-none">
                        <LayoutGrid className="text-blue-600" />
                        Kanban de Traspasos
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
                        onClick={() => handleParamChange('startDate', startDate)}
                        className="p-2.5 bg-slate-50 border border-slate-200 text-blue-600 hover:bg-slate-100 hover:border-slate-300 transition-all rounded-xl shadow-sm cursor-pointer"
                        disabled={loading}
                        title="Actualizar Datos"
                    >
                        <RefreshCcw size={16} className={cn(loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Sub-filters */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap items-center gap-4">
                {/* Global Search */}
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all min-w-[280px]">
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

                <label className="flex items-center gap-2 cursor-pointer select-none ml-auto">
                    <input
                        type="checkbox"
                        checked={includeCancelled}
                        onChange={(e) => handleParamChange('cancelled', e.target.checked ? '1' : '')}
                        className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500/20 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                        <Ban size={12} className="text-red-500" />
                        Mostrar cancelados
                    </span>
                </label>
            </div>

            {/* Pipeline summary header */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                    <div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">Pipeline del Traspaso</h3>
                        <p className="text-xs text-slate-400 font-medium">Flujo: Orden → Recepción → Envío → Entrega en sucursal destino</p>
                    </div>
                    {!loading && (
                        <span className="text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded-full border border-slate-200">
                            {filteredData.length}{searchQuery && ` de ${data.length}`} traspasos en periodo
                        </span>
                    )}
                </div>

                <div className="flex items-stretch gap-0 overflow-x-auto">
                    {COLUMNS.map((col, idx) => {
                        const t = totals[col.id];
                        const isLast = idx === COLUMNS.length - 1;
                        return (
                            <React.Fragment key={col.id}>
                                <div className="flex-1 min-w-[140px] flex flex-col items-center text-center">
                                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center mb-2 ring-4", col.iconBg, col.ring)}>
                                        <col.Icon size={18} />
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{col.title}</p>
                                    <p className="text-lg font-black text-slate-900 tabular-nums">{t.count}</p>
                                    <p className="text-[10px] text-slate-400 font-bold tabular-nums">{formatCurrencyCompact(t.amount)}</p>
                                </div>
                                {!isLast && (
                                    <div className="flex items-center justify-center px-2">
                                        <div className="w-12 h-px bg-slate-200 relative">
                                            <ArrowRight size={14} className="absolute -right-1 -top-1.5 text-slate-300" />
                                        </div>
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {/* Kanban board */}
            {loading ? (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center py-24 text-slate-500">
                    <Loader2 className="animate-spin mb-4 text-blue-600" size={40} />
                    <p className="font-semibold text-sm">Construyendo tablero kanban...</p>
                </div>
            ) : error ? (
                <div className="bg-white rounded-2xl border border-red-100 shadow-sm flex flex-col items-center justify-center py-16 text-red-500">
                    <p className="font-bold text-lg">Error de carga</p>
                    <p className="text-sm opacity-80 mt-1">{error}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    {COLUMNS.map(col => {
                        const rows = grouped[col.id];
                        const t = totals[col.id];
                        return (
                            <div key={col.id} className="bg-slate-50/70 rounded-2xl border border-slate-200/70 flex flex-col max-h-[calc(100vh-280px)] min-h-[400px]">
                                {/* Column header */}
                                <div className="px-4 py-3 border-b border-slate-200/80 bg-white rounded-t-2xl">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", col.iconBg)}>
                                                <col.Icon size={15} />
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider leading-tight">{col.title}</h4>
                                                <p className="text-[10px] text-slate-400 font-semibold leading-tight">{col.subtitle}</p>
                                            </div>
                                        </div>
                                        <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border tabular-nums", col.badge)}>
                                            {t.count}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] font-bold mt-1.5">
                                        <span className="text-slate-400 uppercase tracking-wider">Importe</span>
                                        <span className="text-slate-700 tabular-nums">{formatCurrency(t.amount)}</span>
                                    </div>
                                    <div className="h-1 mt-2 -mb-1 rounded-full bg-slate-100 overflow-hidden">
                                        <div className={cn("h-full", col.bar)} style={{ width: filteredData.length ? `${Math.min(100, (t.count / filteredData.length) * 100)}%` : '0%' }}></div>
                                    </div>
                                </div>

                                {/* Cards */}
                                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                                    {rows.length === 0 ? (
                                        <div className="text-center py-12 text-slate-300">
                                            <col.Icon size={28} className="mx-auto mb-2 opacity-50" />
                                            <p className="text-xs font-semibold">Sin traspasos en esta etapa</p>
                                        </div>
                                    ) : (
                                        rows.map(row => (
                                            <button
                                                key={row.IdTraspaso}
                                                onClick={() => setSelectedTraspaso(row)}
                                                className="w-full text-left bg-white border border-slate-200 rounded-xl p-3 hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5 transition-all cursor-pointer group"
                                            >
                                                {/* Card header */}
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs font-mono font-black text-blue-600 flex items-center gap-1">
                                                        <Hash size={11} />
                                                        {row.IdTraspaso}
                                                    </span>
                                                    {row.OrdenCompraStr && (
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded">
                                                            OC-{row.OrdenCompraStr}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Origen → Destino */}
                                                <div className="text-xs text-slate-700 font-bold flex items-center gap-1 mb-1 truncate">
                                                    <span className="truncate">{row.SucursalOrigen}</span>
                                                    <ArrowRight size={11} className="text-slate-400 shrink-0" />
                                                    <span className="truncate">{row.SucursalDestino}</span>
                                                </div>

                                                {/* Proveedor (si la OC ligada lo tiene) */}
                                                {row.Proveedor && (
                                                    <div className="text-[10px] text-slate-500 font-semibold truncate mb-2 flex items-center gap-1" title={row.Proveedor}>
                                                        <Factory size={10} className="text-slate-400 shrink-0" />
                                                        <span className="truncate">{row.Proveedor}</span>
                                                    </div>
                                                )}

                                                {/* Meta */}
                                                <div className="grid grid-cols-2 gap-1.5 text-[10px] font-semibold text-slate-500">
                                                    <div className="flex items-center gap-1 truncate" title={getEtapaUser(row)}>
                                                        <User size={10} className="text-slate-400 shrink-0" />
                                                        <span className="truncate">{getEtapaUser(row)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1" title="Fecha de esta etapa">
                                                        <Calendar size={10} className="text-slate-400 shrink-0" />
                                                        <span>{formatShortDate(row.FechaEtapa)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Package size={10} className="text-slate-400 shrink-0" />
                                                        <span className="tabular-nums">{row.CantProductos} arts</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 justify-end">
                                                        <DollarSign size={10} className="text-emerald-500 shrink-0" />
                                                        <span className="tabular-nums text-emerald-700 font-black">{formatCurrencyCompact(row.Total)}</span>
                                                    </div>
                                                </div>

                                                {/* Status footer for cancelled */}
                                                {row.Etapa === 'CANCELADO' && (
                                                    <div className="mt-2 pt-2 border-t border-red-100 flex items-center gap-1 text-[10px] font-bold text-red-600">
                                                        <Ban size={10} />
                                                        <span>Cancelado por {row.UsuarioCancelacion || 'desconocido'}</span>
                                                    </div>
                                                )}
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Cancelled column (collapsed below) */}
            {includeCancelled && grouped.CANCELADO.length > 0 && !loading && (
                <div className="bg-red-50/40 rounded-2xl border border-red-200/60 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-100 text-red-600">
                                <Ban size={15} />
                            </div>
                            <div>
                                <h4 className="text-xs font-black text-red-800 uppercase tracking-wider">Cancelados</h4>
                                <p className="text-[10px] text-red-400 font-semibold">Traspasos fuera del flujo normal</p>
                            </div>
                        </div>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 tabular-nums">
                            {grouped.CANCELADO.length}
                        </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        {grouped.CANCELADO.map(row => (
                            <button
                                key={row.IdTraspaso}
                                onClick={() => setSelectedTraspaso(row)}
                                className="text-left bg-white border border-red-200 rounded-xl p-3 hover:shadow-md hover:border-red-400 transition-all cursor-pointer opacity-80 hover:opacity-100"
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-mono font-black text-red-600">#{row.IdTraspaso}</span>
                                    <Ban size={12} className="text-red-500" />
                                </div>
                                <div className="text-xs text-slate-700 font-bold flex items-center gap-1 mb-1 truncate">
                                    <span className="truncate">{row.SucursalOrigen}</span>
                                    <ArrowRight size={11} className="text-slate-400 shrink-0" />
                                    <span className="truncate">{row.SucursalDestino}</span>
                                </div>
                                <p className="text-[10px] text-red-500 font-bold truncate">Cancelado por {row.UsuarioCancelacion || 'desconocido'}</p>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Detail Modal */}
            {selectedTraspaso && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
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
                                    {selectedStepIdx >= 0 && (
                                        <span className={cn("text-xs font-bold px-2 py-0.5 rounded border", COLUMNS[selectedStepIdx].badge)}>
                                            {COLUMNS[selectedStepIdx].title}
                                        </span>
                                    )}
                                    {selectedTraspaso.Etapa === 'CANCELADO' && (
                                        <span className="text-xs font-bold px-2 py-0.5 bg-red-100 text-red-700 rounded border border-red-200">
                                            Cancelado
                                        </span>
                                    )}
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

                        {/* Stepper */}
                        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/40">
                            <div className="flex items-stretch justify-between">
                                {COLUMNS.map((col, idx) => {
                                    const stage = STAGE_FIELDS[idx];
                                    const stageDate = selectedTraspaso[stage.date];
                                    const stageUser = selectedTraspaso[stage.user];
                                    const reached = !!stageDate;
                                    const isCancelled = selectedTraspaso.Etapa === 'CANCELADO';
                                    const isCurrent = selectedStepIdx === idx && !isCancelled;
                                    const isDone = reached && !isCancelled;
                                    return (
                                        <React.Fragment key={col.id}>
                                            <div className="flex flex-col items-center text-center flex-1 min-w-0">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-full flex items-center justify-center mb-1.5 border-2 transition-all",
                                                    isCancelled
                                                        ? "bg-slate-100 text-slate-300 border-slate-200"
                                                        : isDone
                                                            ? cn(col.iconBg, "border-transparent shadow-sm")
                                                            : "bg-white text-slate-300 border-slate-200",
                                                    isCurrent && "ring-4 " + col.ring
                                                )}>
                                                    <col.Icon size={16} />
                                                </div>
                                                <p className={cn(
                                                    "text-[10px] font-bold uppercase tracking-wider truncate w-full px-1",
                                                    isCancelled ? "text-slate-300" : isDone ? "text-slate-800" : "text-slate-400"
                                                )}>{col.title}</p>
                                                <p className={cn(
                                                    "text-[10px] font-semibold tabular-nums mt-0.5",
                                                    isCancelled ? "text-slate-300" : isDone ? "text-slate-600" : "text-slate-300"
                                                )}>
                                                    {reached ? formatShortDate(stageDate) : '— pendiente'}
                                                </p>
                                                <p className={cn(
                                                    "text-[9px] font-semibold truncate w-full px-1 mt-0.5",
                                                    isCancelled ? "text-slate-300" : isDone ? "text-slate-500" : "text-slate-300"
                                                )} title={stageUser || ''}>
                                                    {reached ? (stageUser || 'usuario desconocido') : ''}
                                                </p>
                                            </div>
                                            {idx < COLUMNS.length - 1 && (
                                                <div className={cn(
                                                    "h-0.5 flex-1 mt-5 transition-all",
                                                    !isCancelled && reached ? col.bar : "bg-slate-200"
                                                )}></div>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                            {selectedTraspaso.Etapa === 'CANCELADO' && (
                                <div className="mt-4 flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs">
                                    <Ban size={14} className="text-red-500 shrink-0" />
                                    <span className="text-red-700 font-bold">
                                        Flujo cancelado por <span className="font-mono">{selectedTraspaso.UsuarioCancelacion || 'usuario desconocido'}</span>
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Metadata grid (origen/destino + datos no duplicados con el stepper) */}
                        <div className="p-6 bg-white border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                            <div className="sm:col-span-2">
                                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sucursal Origen</span>
                                <span className="text-slate-900 font-bold text-sm block mt-0.5 truncate flex items-center gap-1.5">
                                    {selectedTraspaso.SucursalOrigen}
                                    <ArrowRight size={12} className="text-slate-400 shrink-0" />
                                    <span className="truncate">{selectedTraspaso.SucursalDestino}</span>
                                </span>
                            </div>
                            <div>
                                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Productos</span>
                                <span className="text-slate-900 font-bold text-sm block mt-0.5 tabular-nums">{selectedTraspaso.CantProductos}</span>
                            </div>
                            {selectedTraspaso.OrdenCompraStr && (
                                <div>
                                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Orden Compra</span>
                                    <span className="text-indigo-600 font-bold text-sm block mt-0.5 truncate font-mono">OC-{selectedTraspaso.OrdenCompraStr}</span>
                                </div>
                            )}
                            {selectedTraspaso.Proveedor && (
                                <div>
                                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Proveedor</span>
                                    <span className="text-slate-900 font-bold text-sm block mt-0.5 truncate" title={selectedTraspaso.Proveedor}>{selectedTraspaso.Proveedor}</span>
                                </div>
                            )}
                        </div>

                        {/* Items */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
                            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                <Package size={16} className="text-slate-500" />
                                Artículos del Traspaso
                            </h4>

                            {detailLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                    <Loader2 className="animate-spin mb-3 text-blue-600" size={32} />
                                    <span className="font-semibold text-xs">Cargando desglose...</span>
                                </div>
                            ) : detailError ? (
                                <div className="bg-red-50 text-red-700 p-4 rounded-xl text-xs border border-red-100">
                                    Error: {detailError}
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

                        {/* Footer */}
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

export default function KanbanTraspasosPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin text-blue-600" size={40} />
            </div>
        }>
            <KanbanContent />
        </Suspense>
    );
}
