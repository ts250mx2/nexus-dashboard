'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import {
    Loader2,
    Store,
    Search,
    X,
    RefreshCcw,
    FileSpreadsheet,
    FileText,
    ArrowUpDown,
    ContactRound,
    Users,
    Mail,
    Phone,
    Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildFormattedSheet, downloadXLSX, safeFileName } from '@/lib/excel-helpers';

interface Profesor {
    IdSocio: number;
    Profesor: string;
    Telefono: string | null;
    Correo: string | null;
    IdSucursal: number | null;
    Sucursal: string | null;
    SucursalInferida: number;
    FechaAlta: string | null;
    UltimaCompra: string | null;
    TotalCompras: number;
    DiasSinComprar: number | null;
}

type ComprasFilter = 'all' | 'si' | 'no';
type SortKey = 'Profesor' | 'Telefono' | 'Correo' | 'Sucursal' | 'FechaAlta' | 'UltimaCompra';

const DATE_KEYS: SortKey[] = ['FechaAlta', 'UltimaCompra'];

const COMPRAS_OPTIONS: { value: ComprasFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'si', label: 'Con compras' },
    { value: 'no', label: 'Sin compras' }
];

const EMPTY = '—';

function formatLongDate(val: string | null): string {
    if (!val) return EMPTY;
    const d = new Date(val);
    if (isNaN(d.getTime())) return EMPTY;
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Fecha en formato ISO corto, para exportaciones donde importa poder ordenar. */
function formatIsoDate(val: string | null): string {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
}

function compareText(a: string | null, b: string | null): number {
    // Ordena ignorando acentos para que "ÁNGEL" caiga junto a "ANGEL".
    return (a || '').localeCompare(b || '', 'es', { sensitivity: 'base' });
}

function ReportContent() {
    const [data, setData] = useState<Profesor[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reloadToken, setReloadToken] = useState(0);

    const [sucursalFilter, setSucursalFilter] = useState<string>('all');
    const [comprasFilter, setComprasFilter] = useState<ComprasFilter>('all');
    const [search, setSearch] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
        key: 'Profesor',
        direction: 'asc'
    });

    useEffect(() => {
        const controller = new AbortController();

        const fetchData = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await fetch('/api/reportes/lista-profesores', { signal: controller.signal });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Error al obtener la lista de profesores');
                setData(result.data || []);
            } catch (err: any) {
                if (err.name !== 'AbortError') setError(err.message);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };

        fetchData();
        return () => controller.abort();
    }, [reloadToken]);

    const sucursalOptions = useMemo(() => {
        const map = new Map<string, string>();
        data.forEach(r => {
            if (r.IdSucursal !== null && r.Sucursal) map.set(String(r.IdSucursal), r.Sucursal);
        });
        return Array.from(map.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => compareText(a.name, b.name));
    }, [data]);

    const hasSinSucursal = useMemo(() => data.some(r => !r.Sucursal), [data]);

    const filteredData = useMemo(() => {
        const term = search.trim().toLowerCase();

        const result = data.filter(r => {
            if (sucursalFilter === 'none') {
                if (r.Sucursal) return false;
            } else if (sucursalFilter !== 'all' && String(r.IdSucursal) !== sucursalFilter) {
                return false;
            }

            if (comprasFilter === 'si' && !r.UltimaCompra) return false;
            if (comprasFilter === 'no' && r.UltimaCompra) return false;

            if (!term) return true;
            return (
                (r.Profesor || '').toLowerCase().includes(term) ||
                (r.Telefono || '').toLowerCase().includes(term) ||
                (r.Correo || '').toLowerCase().includes(term)
            );
        });

        const { key, direction } = sortConfig;
        const dir = direction === 'asc' ? 1 : -1;

        return [...result].sort((a, b) => {
            const valA = a[key];
            const valB = b[key];

            // Los vacíos siempre al final, sin importar la dirección.
            if (!valA && !valB) return compareText(a.Profesor, b.Profesor);
            if (!valA) return 1;
            if (!valB) return -1;

            if (DATE_KEYS.includes(key)) {
                const diff = new Date(valA as string).getTime() - new Date(valB as string).getTime();
                return diff === 0 ? compareText(a.Profesor, b.Profesor) : diff * dir;
            }

            const cmp = compareText(String(valA), String(valB));
            return cmp === 0 ? compareText(a.Profesor, b.Profesor) : cmp * dir;
        });
    }, [data, sucursalFilter, comprasFilter, search, sortConfig]);

    const handleSort = (key: SortKey) => {
        setSortConfig(prev =>
            prev.key === key
                ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
                : { key, direction: 'asc' }
        );
    };

    const sucursalLabel =
        sucursalFilter === 'all'
            ? 'Todas las sucursales'
            : sucursalFilter === 'none'
                ? 'Sin sucursal asignada'
                : sucursalOptions.find(s => s.id === sucursalFilter)?.name || sucursalFilter;

    const comprasLabel = COMPRAS_OPTIONS.find(o => o.value === comprasFilter)?.label || 'Todos';

    const handleExportExcel = () => {
        if (filteredData.length === 0) return;

        const ws = buildFormattedSheet({
            title: 'Lista de Profesores',
            meta: [
                { label: 'Sucursal:', value: sucursalLabel },
                { label: 'Filtro:', value: comprasLabel },
                { label: 'Profesores listados:', value: String(filteredData.length) },
                { label: 'Generado:', value: new Date().toLocaleString('es-MX') }
            ],
            columns: [
                { header: '#', key: '_idx', width: 6, align: 'center', isNumber: true },
                { header: 'Profesor', key: 'Profesor', width: 42 },
                { header: 'Teléfono', key: 'Telefono', width: 16 },
                { header: 'Correo Electrónico', key: 'Correo', width: 34 },
                { header: 'Sucursal', key: 'Sucursal', width: 22 },
                { header: 'Fecha de Alta', key: 'FechaAlta', width: 15, align: 'center' },
                { header: 'Última Compra', key: 'UltimaCompra', width: 15, align: 'center' }
            ],
            rows: filteredData.map((r, i) => ({
                _idx: i + 1,
                Profesor: r.Profesor,
                Telefono: r.Telefono || '',
                Correo: r.Correo || '',
                Sucursal: r.Sucursal || 'Sin asignar',
                FechaAlta: formatIsoDate(r.FechaAlta),
                UltimaCompra: formatIsoDate(r.UltimaCompra)
            }))
        });

        downloadXLSX(`Lista_de_Profesores_${safeFileName(sucursalLabel)}.xlsx`, [{ name: 'Profesores', ws }]);
    };

    const handleExportPDF = () => {
        if (filteredData.length === 0) return;

        const doc = new jsPDF({ orientation: 'landscape' });

        doc.setFontSize(18);
        doc.setTextColor(30, 41, 59);
        doc.text('Lista de Profesores', 14, 20);
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text(`Sucursal: ${sucursalLabel}   |   Filtro: ${comprasLabel}   |   ${filteredData.length} profesores`, 14, 28);
        doc.text(`Generado el: ${new Date().toLocaleString('es-MX')}`, 14, 33);

        autoTable(doc, {
            head: [['#', 'Profesor', 'Teléfono', 'Correo Electrónico', 'Sucursal', 'Fecha de Alta', 'Última Compra']],
            body: filteredData.map((r, i) => [
                String(i + 1),
                r.Profesor,
                r.Telefono || EMPTY,
                r.Correo || EMPTY,
                r.Sucursal || 'Sin asignar',
                formatLongDate(r.FechaAlta),
                formatLongDate(r.UltimaCompra)
            ]),
            startY: 40,
            theme: 'striped',
            headStyles: { fillColor: [37, 99, 235] },
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: {
                0: { halign: 'center', cellWidth: 12 },
                5: { halign: 'center' },
                6: { halign: 'center' }
            }
        });

        doc.save(`Lista_de_Profesores_${safeFileName(sucursalLabel)}.pdf`);
    };

    const renderSortableHeader = (key: SortKey, label: string, align: 'left' | 'center' = 'left') => (
        <th
            className={cn(
                'px-5 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group',
                align === 'center' && 'text-center'
            )}
            onClick={() => handleSort(key)}
        >
            <div className={cn('flex items-center gap-1', align === 'center' ? 'justify-center' : 'justify-between')}>
                {label}
                <ArrowUpDown
                    size={14}
                    className={cn(
                        'text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity',
                        sortConfig.key === key && 'opacity-100 text-blue-500'
                    )}
                />
            </div>
        </th>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white py-4 px-6 rounded-2xl shadow-sm border border-slate-100 animate-in fade-in duration-500">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3 select-none">
                        <ContactRound className="text-blue-600" />
                        Lista de Profesores
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Directorio completo con datos de contacto, sucursal, alta y última compra.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={() => setReloadToken(t => t + 1)}
                        className="p-2.5 bg-slate-50 border border-slate-200 text-blue-600 hover:bg-slate-100 hover:border-slate-300 transition-all rounded-xl shadow-sm"
                        disabled={loading}
                        title="Actualizar Datos"
                    >
                        <RefreshCcw size={16} className={cn(loading && 'animate-spin')} />
                    </button>
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

            {loading ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <Loader2 className="animate-spin mb-4 text-blue-600" size={40} />
                    <p className="font-medium">Cargando profesores...</p>
                </div>
            ) : error ? (
                <div className="bg-red-50 border border-red-200 text-red-600 p-6 rounded-2xl flex flex-col items-center">
                    <p className="font-bold">Error al cargar datos</p>
                    <p className="text-sm mt-1">{error}</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    {/* Toolbar */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/60">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                            <Users size={16} className="text-blue-600" />
                            {filteredData.length} profesor{filteredData.length === 1 ? '' : 'es'}
                            {filteredData.length !== data.length && (
                                <span className="text-[11px] font-semibold text-slate-400 ml-1">de {data.length}</span>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5">
                                {COMPRAS_OPTIONS.map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setComprasFilter(opt.value)}
                                        className={cn(
                                            'px-3 py-1 text-xs font-bold rounded-lg transition-all',
                                            comprasFilter === opt.value
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50'
                                        )}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
                                <Store size={15} className="text-blue-500" />
                                <select
                                    value={sucursalFilter}
                                    onChange={e => setSucursalFilter(e.target.value)}
                                    className="bg-transparent text-xs font-bold text-slate-700 outline-none border-none cursor-pointer max-w-[180px]"
                                >
                                    <option value="all">Todas las sucursales</option>
                                    {sucursalOptions.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                    {hasSinSucursal && <option value="none">Sin sucursal asignada</option>}
                                </select>
                            </div>

                            <div className="relative flex items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-500/10 focus-within:border-blue-500 transition-all w-full sm:w-60">
                                <Search size={15} className="text-slate-400 mr-2 shrink-0" />
                                <input
                                    type="text"
                                    placeholder="Buscar nombre, teléfono o correo..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
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

                    {/* Table */}
                    <div className="overflow-auto max-h-[68vh] nice-scroll">
                        <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
                            <thead className="bg-slate-50 sticky top-0 shadow-sm z-10 border-b border-slate-200">
                                <tr>
                                    <th className="px-5 py-4 font-bold text-slate-400 uppercase tracking-wider text-center w-14">#</th>
                                    {renderSortableHeader('Profesor', 'Profesor')}
                                    {renderSortableHeader('Telefono', 'Teléfono')}
                                    {renderSortableHeader('Correo', 'Correo Electrónico')}
                                    {renderSortableHeader('Sucursal', 'Sucursal')}
                                    {renderSortableHeader('FechaAlta', 'Fecha de Alta', 'center')}
                                    {renderSortableHeader('UltimaCompra', 'Última Compra', 'center')}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                                            No se encontraron profesores con los filtros seleccionados.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredData.map((row, idx) => (
                                        <tr key={row.IdSocio} className="hover:bg-blue-50/50 transition-colors group">
                                            <td className="px-5 py-3.5 text-center text-xs text-slate-400 tabular-nums">{idx + 1}</td>
                                            <td className="px-5 py-3.5 font-medium text-slate-900">{row.Profesor}</td>
                                            <td className="px-5 py-3.5 text-slate-600 tabular-nums">
                                                {row.Telefono ? (
                                                    <a
                                                        href={`tel:${row.Telefono.replace(/[^\d+]/g, '')}`}
                                                        className="inline-flex items-center gap-1.5 hover:text-blue-600 transition-colors"
                                                    >
                                                        <Phone size={13} className="text-slate-300 group-hover:text-blue-400 transition-colors" />
                                                        {row.Telefono}
                                                    </a>
                                                ) : (
                                                    <span className="text-slate-300">{EMPTY}</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5 text-slate-600">
                                                {row.Correo ? (
                                                    <a
                                                        href={`mailto:${row.Correo}`}
                                                        className="inline-flex items-center gap-1.5 hover:text-blue-600 transition-colors"
                                                    >
                                                        <Mail size={13} className="text-slate-300 group-hover:text-blue-400 transition-colors" />
                                                        {row.Correo}
                                                    </a>
                                                ) : (
                                                    <span className="text-slate-300">{EMPTY}</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {row.Sucursal ? (
                                                    <span
                                                        className={cn(
                                                            'text-xs font-bold px-2.5 py-1 rounded-full border',
                                                            row.SucursalInferida === 1
                                                                ? 'bg-slate-50 text-slate-500 border-slate-200 border-dashed'
                                                                : 'bg-blue-50 text-blue-700 border-blue-100'
                                                        )}
                                                        title={
                                                            row.SucursalInferida === 1
                                                                ? 'Sin sucursal en su registro: se muestra la sucursal de su última compra.'
                                                                : 'Sucursal registrada en su ficha de socio.'
                                                        }
                                                    >
                                                        {row.Sucursal}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-slate-300 italic">Sin asignar</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5 text-center text-slate-600 text-xs tabular-nums">
                                                {formatLongDate(row.FechaAlta)}
                                            </td>
                                            <td
                                                className="px-5 py-3.5 text-center text-xs tabular-nums"
                                                title={
                                                    row.DiasSinComprar !== null
                                                        ? `${row.DiasSinComprar} días sin comprar · ${row.TotalCompras} compras en total`
                                                        : 'Sin compras registradas'
                                                }
                                            >
                                                {row.UltimaCompra ? (
                                                    <span className="text-slate-600">{formatLongDate(row.UltimaCompra)}</span>
                                                ) : (
                                                    <span className="text-slate-300">Sin compras</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Nota metodológica */}
                    <div className="flex items-start gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-500 leading-relaxed">
                        <Info size={13} className="text-slate-400 shrink-0 mt-0.5" />
                        <p>
                            La <strong>fecha de alta</strong> es la más antigua entre el registro del socio y su primera compra.
                            Las sucursales con <span className="font-semibold">borde punteado</span> se infieren de la última compra,
                            porque el profesor no tiene sucursal en su ficha.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ListaProfesoresPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center min-h-[400px]">
                    <Loader2 className="animate-spin text-blue-600" size={40} />
                </div>
            }
        >
            <ReportContent />
        </Suspense>
    );
}
