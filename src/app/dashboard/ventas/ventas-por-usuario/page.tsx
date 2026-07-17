'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    Loader2,
    Store,
    Calendar,
    Search,
    X,
    RefreshCcw,
    FileSpreadsheet,
    FileText,
    ArrowUpDown,
    UserRound,
    Users,
    TrendingUp
} from 'lucide-react';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import DatePresetsProfesores from '@/components/DatePresetsProfesores';
import VentasUsuarioDetailModal from '@/components/VentasUsuarioDetailModal';
import VentasItemDetailModal from '@/components/VentasItemDetailModal';
import { buildFormattedSheet, downloadXLSX, safeFileName } from '@/lib/excel-helpers';

function ReportContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [sucursalFilter, setSucursalFilter] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'ImporteTotal', direction: 'desc' });

    // Modal stack
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectedUsuario, setSelectedUsuario] = useState<{ id: number; name: string; sucursalId: string; sucursalName: string } | null>(null);

    const [isVentaModalOpen, setIsVentaModalOpen] = useState(false);
    const [selectedVenta, setSelectedVenta] = useState<{ id: number; folio: string; sucursalId: number; clienteName: string } | null>(null);

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

    const startDate = searchParams.get('startDate') || getFirstOfMonth();
    const endDate = searchParams.get('endDate') || getToday();

    useEffect(() => {
        if (!startDate || !endDate) return;

        let isMounted = true;
        const fetchData = async () => {
            setLoading(true);
            setError(null);

            try {
                const url = `/api/reportes/ventas-usuario?startDate=${startDate}&endDate=${endDate}&sucursalId=all`;
                const response = await fetch(url);
                const result = await response.json();

                if (!response.ok) throw new Error(result.error || 'Error al obtener el reporte');
                if (isMounted) setData(result.data || []);
            } catch (err: any) {
                if (isMounted) setError(err.message);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData();
        return () => { isMounted = false; };
    }, [startDate, endDate]);

    const handleParamChange = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set(key, value);
        else params.delete(key);
        router.push(`?${params.toString()}`, { scroll: false });
    };

    // Opciones de sucursal derivadas de los datos
    const sucursalOptions = useMemo(() => {
        const map = new Map<string, string>();
        data.forEach(r => map.set(String(r.IdSucursal), r.Sucursal));
        return Array.from(map.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [data]);

    const filteredData = useMemo(() => {
        let result = data.filter(r =>
            (sucursalFilter === 'all' || String(r.IdSucursal) === sucursalFilter) &&
            (r.Usuario || '').toLowerCase().includes(search.toLowerCase())
        );

        result = [...result].sort((a, b) => {
            const valA = a[sortConfig.key];
            const valB = b[sortConfig.key];
            if (valA === valB) return 0;
            if (valA === null || valA === undefined) return 1;
            if (valB === null || valB === undefined) return -1;

            const numA = Number(valA);
            const numB = Number(valB);
            if (!isNaN(numA) && !isNaN(numB) && sortConfig.key !== 'Usuario' && sortConfig.key !== 'Sucursal' && sortConfig.key !== 'UltimaVenta') {
                return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
            }

            const sa = String(valA).toLowerCase();
            const sb = String(valB).toLowerCase();
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
        const num = Number(val);
        if (isNaN(num)) return val;
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
    };

    const formatInt = (val: any) => new Intl.NumberFormat('es-MX').format(Number(val) || 0);

    const formatShortDate = (val: any) => {
        if (!val) return '—';
        try {
            return new Date(val).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return String(val);
        }
    };

    // Totales de la vista filtrada
    const totals = useMemo(() => {
        const totalVentas = filteredData.reduce((acc, r) => acc + (Number(r.TotalVentas) || 0), 0);
        const totalImporte = filteredData.reduce((acc, r) => acc + (Number(r.ImporteTotal) || 0), 0);
        return {
            totalVentas,
            totalImporte,
            ticketPromedio: totalVentas > 0 ? totalImporte / totalVentas : null
        };
    }, [filteredData]);

    const sucursalLabel = sucursalFilter === 'all'
        ? 'Todas las sucursales'
        : (sucursalOptions.find(s => s.id === sucursalFilter)?.name || sucursalFilter);

    const handleExportExcel = () => {
        if (filteredData.length === 0) return;
        const ws = buildFormattedSheet({
            title: 'Ventas por Usuario',
            meta: [
                { label: 'Periodo:', value: `${startDate} al ${endDate}` },
                { label: 'Sucursal:', value: sucursalLabel },
                { label: 'Usuarios listados:', value: String(filteredData.length) },
                { label: 'Generado:', value: new Date().toLocaleString('es-MX') }
            ],
            columns: [
                { header: '#', key: '_idx', width: 6, align: 'center', isNumber: true },
                { header: 'Usuario', key: 'Usuario', width: 34 },
                { header: 'Sucursal', key: 'Sucursal', width: 24 },
                { header: '# Ventas', key: 'TotalVentas', width: 10, isNumber: true, align: 'right' },
                { header: 'Ticket Promedio', key: 'TicketPromedio', width: 18, isCurrency: true, align: 'right' },
                { header: 'Importe Total', key: 'ImporteTotal', width: 18, isCurrency: true, align: 'right' },
                { header: 'Última Venta', key: 'UltimaVenta', width: 16, align: 'center' }
            ],
            rows: filteredData.map((r, i) => ({
                _idx: i + 1,
                Usuario: r.Usuario,
                Sucursal: r.Sucursal,
                TotalVentas: r.TotalVentas,
                TicketPromedio: r.TicketPromedio,
                ImporteTotal: r.ImporteTotal,
                UltimaVenta: formatShortDate(r.UltimaVenta)
            })),
            totalRow: {
                label: 'TOTAL',
                values: { TotalVentas: totals.totalVentas, ImporteTotal: totals.totalImporte }
            }
        });

        downloadXLSX(
            `Ventas_por_Usuario_${safeFileName(sucursalLabel)}_${startDate}_al_${endDate}.xlsx`,
            [{ name: 'Usuarios', ws }]
        );
    };

    const handleExportPDF = () => {
        if (filteredData.length === 0) return;
        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.setTextColor(30, 41, 59);
        doc.text('Ventas por Usuario', 14, 20);
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text(`Periodo: ${startDate} al ${endDate}   |   Sucursal: ${sucursalLabel}`, 14, 28);
        doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, 33);

        const tableColumn = ["Usuario", "Sucursal", "# Ventas", "T. Promedio", "Importe Total", "Última Venta"];
        const tableRows = filteredData.map(row => [
            row.Usuario,
            row.Sucursal,
            formatInt(row.TotalVentas),
            formatCurrency(row.TicketPromedio),
            formatCurrency(row.ImporteTotal),
            formatShortDate(row.UltimaVenta)
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 40,
            theme: 'striped',
            headStyles: { fillColor: [37, 99, 235] },
            styles: { fontSize: 8.5, cellPadding: 2.5 },
            columnStyles: {
                2: { halign: 'center' },
                3: { halign: 'right' },
                4: { halign: 'right' },
                5: { halign: 'center' }
            }
        });

        doc.save(`Ventas_por_Usuario_${startDate}_al_${endDate}.pdf`);
    };

    return (
        <div className="space-y-6">
            {/* Header with Filters & Periods */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white py-4 px-6 rounded-2xl shadow-sm border border-slate-100 animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3 select-none">
                        <UserRound className="text-blue-600" />
                        Ventas por Usuario
                    </h1>

                    <DatePresetsProfesores />
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
                        className="p-2.5 bg-slate-50 border border-slate-200 text-blue-600 hover:bg-slate-100 hover:border-slate-300 transition-all rounded-xl shadow-sm"
                        disabled={loading}
                        title="Actualizar Datos"
                    >
                        <RefreshCcw size={16} className={cn(loading && "animate-spin")} />
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

            {/* Table */}
            {loading ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <Loader2 className="animate-spin mb-4 text-blue-600" size={40} />
                    <p className="font-medium">Cargando usuarios...</p>
                </div>
            ) : error ? (
                <div className="bg-red-50 border border-red-200 text-red-600 p-6 rounded-2xl flex flex-col items-center">
                    <p className="font-bold">Error al cargar datos</p>
                    <p className="text-sm mt-1">{error}</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    {/* Toolbar: count + filters */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/60">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                            <Users size={16} className="text-blue-600" />
                            {filteredData.length} usuario{filteredData.length === 1 ? '' : 's'}
                            <span className="text-[11px] font-semibold text-slate-400 ml-1">Haz clic en un usuario para ver sus ventas.</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
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
                            <div className="relative flex items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-500/10 focus-within:border-blue-500 transition-all w-full sm:w-56">
                                <Search size={15} className="text-slate-400 mr-2 shrink-0" />
                                <input
                                    type="text"
                                    placeholder="Buscar usuario..."
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

                    <div className="overflow-auto max-h-[68vh] nice-scroll">
                        <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
                            <thead className="bg-slate-50 sticky top-0 shadow-sm z-10 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group" onClick={() => handleSort('Usuario')}>
                                        <div className="flex items-center gap-1 justify-between">
                                            Usuario
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig.key === 'Usuario' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group" onClick={() => handleSort('Sucursal')}>
                                        <div className="flex items-center gap-1 justify-between">
                                            Sucursal
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig.key === 'Sucursal' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group text-center" onClick={() => handleSort('TotalVentas')}>
                                        <div className="flex items-center gap-1 justify-center">
                                            # Ventas
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig.key === 'TotalVentas' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group text-right" onClick={() => handleSort('TicketPromedio')}>
                                        <div className="flex items-center gap-1 justify-end">
                                            Ticket Promedio
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig.key === 'TicketPromedio' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group text-right" onClick={() => handleSort('ImporteTotal')}>
                                        <div className="flex items-center gap-1 justify-end">
                                            Importe Total
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig.key === 'ImporteTotal' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group text-center" onClick={() => handleSort('UltimaVenta')}>
                                        <div className="flex items-center gap-1 justify-center">
                                            Última Venta
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig.key === 'UltimaVenta' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                            No se encontraron usuarios con ventas en el periodo seleccionado.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredData.map((row, idx) => (
                                        <tr
                                            key={idx}
                                            className="hover:bg-blue-50/50 transition-colors group cursor-pointer"
                                            onClick={() => {
                                                setSelectedUsuario({
                                                    id: row.IdUsuario,
                                                    name: row.Usuario,
                                                    sucursalId: sucursalFilter === 'all' ? String(row.IdSucursal) : sucursalFilter,
                                                    sucursalName: row.Sucursal
                                                });
                                                setIsDetailModalOpen(true);
                                            }}
                                            title="Ver ventas de este usuario"
                                        >
                                            <td className="px-6 py-4 font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                                                {row.Usuario}
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 italic">
                                                {row.Sucursal}
                                            </td>
                                            <td className="px-6 py-4 text-center text-slate-600 font-mono">
                                                {formatInt(row.TotalVentas)}
                                            </td>
                                            <td className="px-6 py-4 text-right text-slate-500">
                                                {formatCurrency(row.TicketPromedio)}
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold text-blue-600">
                                                <div className="flex items-center justify-end gap-2">
                                                    <TrendingUp size={14} className="text-green-500" />
                                                    {formatCurrency(row.ImporteTotal)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center text-slate-600 text-xs tabular-nums">
                                                {formatShortDate(row.UltimaVenta)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {filteredData.length > 0 && (
                                <tfoot className="sticky bottom-0 bg-slate-50 border-t-2 border-slate-200">
                                    <tr className="font-bold text-slate-700">
                                        <td className="px-6 py-3 text-xs uppercase tracking-wider text-slate-400" colSpan={2}>Totales ({filteredData.length})</td>
                                        <td className="px-6 py-3 text-center tabular-nums">{formatInt(totals.totalVentas)}</td>
                                        <td className="px-6 py-3 text-right tabular-nums text-slate-500">{totals.ticketPromedio !== null ? formatCurrency(totals.ticketPromedio) : '—'}</td>
                                        <td className="px-6 py-3 text-right tabular-nums">{formatCurrency(totals.totalImporte)}</td>
                                        <td className="px-6 py-3"></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}

            {/* MODAL STACK */}

            {/* Level 1: Sales of the user */}
            <VentasUsuarioDetailModal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                idUsuario={selectedUsuario?.id || null}
                usuarioName={selectedUsuario?.name || ''}
                startDate={startDate}
                endDate={endDate}
                sucursalId={selectedUsuario?.sucursalId || 'all'}
                sucursalName={selectedUsuario?.sucursalName || ''}
                onSaleClick={(sale) => {
                    setSelectedVenta(sale);
                    setIsVentaModalOpen(true);
                }}
            />

            {/* Level 2: Ticket items */}
            <VentasItemDetailModal
                isOpen={isVentaModalOpen}
                onClose={() => setIsVentaModalOpen(false)}
                idVenta={selectedVenta?.id || null}
                idSucursal={selectedVenta?.sucursalId || null}
                folioVenta={selectedVenta?.folio || ''}
                clienteName={selectedVenta?.clienteName || ''}
            />
        </div>
    );
}

export default function VentasPorUsuarioPage() {
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
