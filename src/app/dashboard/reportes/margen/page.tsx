'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    TrendingUp,
    TrendingDown,
    DollarSign,
    Package,
    Receipt,
    Loader2,
    Download,
    ArrowUpDown,
    Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

type GroupBy = 'sucursal' | 'depto' | 'articulo' | 'categoria' | 'marca';

interface Row {
    Grupo: string;
    Unidades: number;
    Ingreso: number;
    Costo: number;
    Utilidad: number;
    MargenPct: number;
    Tickets: number;
}

interface Kpis {
    ingreso: number;
    costo: number;
    utilidad: number;
    margenPct: number;
    unidades: number;
    tickets: number;
}

const GROUPS: { key: GroupBy; label: string }[] = [
    { key: 'sucursal', label: 'Sucursal' },
    { key: 'depto', label: 'Departamento' },
    { key: 'categoria', label: 'Categoría' },
    { key: 'marca', label: 'Marca' },
    { key: 'articulo', label: 'Artículo (Top 100)' }
];

function fmtMoney(n: number | undefined | null): string {
    if (n == null || isNaN(Number(n))) return '$0';
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(n));
}

function fmtPct(n: number | undefined | null): string {
    if (n == null || isNaN(Number(n))) return '0.0%';
    return `${Number(n).toFixed(1)}%`;
}

function fmtNumber(n: number | undefined | null): string {
    if (n == null || isNaN(Number(n))) return '0';
    return new Intl.NumberFormat('es-MX').format(Number(n));
}

function getToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function getFirstOfMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function MargenPage() {
    const [startDate, setStartDate] = useState(getFirstOfMonth());
    const [endDate, setEndDate] = useState(getToday());
    const [groupBy, setGroupBy] = useState<GroupBy>('sucursal');
    const [rows, setRows] = useState<Row[]>([]);
    const [kpis, setKpis] = useState<Kpis | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<keyof Row>('Utilidad');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    useEffect(() => {
        const ctrl = new AbortController();
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const url = `/api/reportes/margen?startDate=${startDate}&endDate=${endDate}&groupBy=${groupBy}`;
                const res = await fetch(url, { signal: ctrl.signal });
                const json = await res.json();
                if (!json.success) throw new Error(json.error || 'Error');
                setRows(json.data || []);
                setKpis(json.kpis || null);
            } catch (e: any) {
                if (e.name !== 'AbortError') setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
        return () => ctrl.abort();
    }, [startDate, endDate, groupBy]);

    const sortedRows = useMemo(() => {
        const copy = [...rows];
        copy.sort((a, b) => {
            const av = a[sortKey];
            const bv = b[sortKey];
            if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
            return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
        });
        return copy;
    }, [rows, sortKey, sortDir]);

    const toggleSort = (key: keyof Row) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    const exportXls = () => {
        const ws = XLSX.utils.json_to_sheet(sortedRows.map(r => ({
            [GROUPS.find(g => g.key === groupBy)!.label]: r.Grupo,
            Unidades: r.Unidades,
            Ingreso: r.Ingreso,
            Costo: r.Costo,
            Utilidad: r.Utilidad,
            'Margen %': Number(r.MargenPct).toFixed(2),
            Tickets: r.Tickets
        })));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Margen');
        XLSX.writeFile(wb, `margen-${groupBy}-${startDate}-a-${endDate}.xlsx`);
    };

    return (
        <div className="p-6 md:p-8 max-w-[1600px] mx-auto">
            <div className="mb-6">
                <h1 className="text-3xl font-black tracking-tight text-slate-900">Margen y Rentabilidad</h1>
                <p className="text-slate-500 mt-1">
                    Cruza ventas reales con costo de inventario por sucursal. Identifica dónde se hace dinero y dónde se fuga el margen.
                </p>
            </div>

            {/* Filtros */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 shadow-sm">
                <div className="flex flex-wrap items-end gap-4">
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Desde</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Hasta</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Atajos</label>
                        <div className="flex gap-1.5">
                            {[
                                { label: 'Hoy', fn: () => { const t = getToday(); setStartDate(t); setEndDate(t); } },
                                { label: '7d', fn: () => { const d = new Date(); d.setDate(d.getDate() - 6); setStartDate(d.toISOString().slice(0, 10)); setEndDate(getToday()); } },
                                { label: 'Mes', fn: () => { setStartDate(getFirstOfMonth()); setEndDate(getToday()); } },
                                { label: 'Mes anterior', fn: () => { const d = new Date(); const first = new Date(d.getFullYear(), d.getMonth() - 1, 1); const last = new Date(d.getFullYear(), d.getMonth(), 0); setStartDate(first.toISOString().slice(0, 10)); setEndDate(last.toISOString().slice(0, 10)); } },
                                { label: 'Año', fn: () => { setStartDate(`${new Date().getFullYear()}-01-01`); setEndDate(getToday()); } }
                            ].map(p => (
                                <button
                                    key={p.label}
                                    onClick={p.fn}
                                    className="px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-600 rounded-lg transition-colors"
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                            <Filter className="inline w-3 h-3 mr-1" />
                            Agrupar por
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {GROUPS.map(g => (
                                <button
                                    key={g.key}
                                    onClick={() => setGroupBy(g.key)}
                                    className={cn(
                                        'px-3 py-2 rounded-lg text-sm font-bold border transition-all',
                                        groupBy === g.key
                                            ? 'bg-blue-600 text-white border-blue-600 shadow'
                                            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                                    )}
                                >
                                    {g.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="ml-auto">
                        <button
                            onClick={exportXls}
                            disabled={loading || rows.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold shadow"
                        >
                            <Download className="w-4 h-4" /> Exportar XLSX
                        </button>
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <KpiCard
                    icon={<DollarSign />}
                    label="Ingreso"
                    value={fmtMoney(kpis?.ingreso)}
                    accent="emerald"
                    loading={loading}
                />
                <KpiCard
                    icon={<Package />}
                    label="Costo"
                    value={fmtMoney(kpis?.costo)}
                    accent="orange"
                    loading={loading}
                />
                <KpiCard
                    icon={<TrendingUp />}
                    label="Utilidad bruta"
                    value={fmtMoney(kpis?.utilidad)}
                    accent="blue"
                    loading={loading}
                    secondary={
                        kpis?.utilidad != null && kpis.utilidad < 0 ? (
                            <span className="text-rose-600 flex items-center gap-1 text-xs font-bold mt-1">
                                <TrendingDown className="w-3 h-3" /> Pérdida
                            </span>
                        ) : null
                    }
                />
                <KpiCard
                    icon={<Receipt />}
                    label="Margen %"
                    value={fmtPct(kpis?.margenPct)}
                    accent={
                        kpis && kpis.margenPct >= 30 ? 'emerald' :
                            kpis && kpis.margenPct >= 15 ? 'blue' :
                                kpis && kpis.margenPct >= 0 ? 'amber' : 'rose'
                    }
                    loading={loading}
                    secondary={
                        <span className="text-xs text-slate-500 font-medium mt-1">
                            {fmtNumber(kpis?.tickets)} tickets · {fmtNumber(kpis?.unidades)} u.
                        </span>
                    }
                />
            </div>

            {/* Tabla */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-700">
                        Detalle por {GROUPS.find(g => g.key === groupBy)?.label}
                    </h2>
                    <span className="text-xs text-slate-500 font-bold">{sortedRows.length} filas</span>
                </div>
                {error && (
                    <div className="p-6 text-rose-600 text-sm font-medium">Error: {error}</div>
                )}
                {loading && rows.length === 0 ? (
                    <div className="flex items-center justify-center py-20 text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <Th label={GROUPS.find(g => g.key === groupBy)?.label || ''} onClick={() => toggleSort('Grupo')} active={sortKey === 'Grupo'} dir={sortDir} align="left" />
                                    <Th label="Unidades" onClick={() => toggleSort('Unidades')} active={sortKey === 'Unidades'} dir={sortDir} />
                                    <Th label="Ingreso" onClick={() => toggleSort('Ingreso')} active={sortKey === 'Ingreso'} dir={sortDir} />
                                    <Th label="Costo" onClick={() => toggleSort('Costo')} active={sortKey === 'Costo'} dir={sortDir} />
                                    <Th label="Utilidad" onClick={() => toggleSort('Utilidad')} active={sortKey === 'Utilidad'} dir={sortDir} />
                                    <Th label="Margen %" onClick={() => toggleSort('MargenPct')} active={sortKey === 'MargenPct'} dir={sortDir} />
                                    <Th label="Tickets" onClick={() => toggleSort('Tickets')} active={sortKey === 'Tickets'} dir={sortDir} />
                                </tr>
                            </thead>
                            <tbody>
                                {sortedRows.map((r, i) => {
                                    const pct = Number(r.MargenPct) || 0;
                                    return (
                                        <tr key={i} className="border-b border-slate-100 hover:bg-blue-50/30">
                                            <td className="px-4 py-3 font-bold text-slate-800">{r.Grupo}</td>
                                            <td className="px-4 py-3 text-right tabular-nums">{fmtNumber(r.Unidades)}</td>
                                            <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-700">{fmtMoney(r.Ingreso)}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-orange-700">{fmtMoney(r.Costo)}</td>
                                            <td className={cn('px-4 py-3 text-right tabular-nums font-bold', Number(r.Utilidad) < 0 ? 'text-rose-600' : 'text-emerald-700')}>
                                                {fmtMoney(r.Utilidad)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums">
                                                <span className={cn(
                                                    'inline-flex items-center px-2 py-0.5 rounded-md font-bold text-xs',
                                                    pct >= 30 ? 'bg-emerald-100 text-emerald-700' :
                                                        pct >= 15 ? 'bg-blue-100 text-blue-700' :
                                                            pct >= 0 ? 'bg-amber-100 text-amber-700' :
                                                                'bg-rose-100 text-rose-700'
                                                )}>
                                                    {fmtPct(pct)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-slate-500">{fmtNumber(r.Tickets)}</td>
                                        </tr>
                                    );
                                })}
                                {sortedRows.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={7} className="text-center py-12 text-slate-400 font-medium">
                                            Sin datos para los filtros seleccionados
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <p className="text-xs text-slate-400 mt-6 font-medium">
                * El costo unitario se toma de <code>tblCostoInventario.PrecioBase</code> por sucursal. Cuando una sucursal no tiene costo registrado, se usa el costo global del artículo (<code>tblArticulos.PrecioBase</code>).
            </p>
        </div>
    );
}

function Th({ label, onClick, active, dir, align = 'right' }: { label: string; onClick: () => void; active: boolean; dir: 'asc' | 'desc'; align?: 'left' | 'right' }) {
    return (
        <th
            onClick={onClick}
            className={cn(
                'px-4 py-3 font-black text-xs uppercase tracking-wider text-slate-600 cursor-pointer select-none hover:text-blue-700',
                align === 'right' ? 'text-right' : 'text-left'
            )}
        >
            <span className="inline-flex items-center gap-1">
                {label}
                <ArrowUpDown className={cn('w-3 h-3', active ? 'text-blue-600' : 'opacity-30')} />
                {active && <span className="text-blue-600">{dir === 'asc' ? '↑' : '↓'}</span>}
            </span>
        </th>
    );
}

function KpiCard({
    icon, label, value, accent, loading, secondary
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    accent: 'emerald' | 'blue' | 'orange' | 'amber' | 'rose';
    loading?: boolean;
    secondary?: React.ReactNode;
}) {
    const accentMap: Record<string, string> = {
        emerald: 'bg-emerald-50 text-emerald-600',
        blue: 'bg-blue-50 text-blue-600',
        orange: 'bg-orange-50 text-orange-600',
        amber: 'bg-amber-50 text-amber-600',
        rose: 'bg-rose-50 text-rose-600'
    };
    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
                <div className={cn('p-2 rounded-xl', accentMap[accent])}>
                    {icon}
                </div>
                <span className="text-xs font-black uppercase tracking-widest text-slate-500">{label}</span>
            </div>
            <div className="text-2xl font-black tracking-tight text-slate-900 tabular-nums">
                {loading ? <Loader2 className="w-5 h-5 animate-spin text-slate-300" /> : value}
            </div>
            {secondary}
        </div>
    );
}
