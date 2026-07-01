'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { X, Loader2, Users, ArrowUpDown, Filter, Store, FileSpreadsheet, FileText, ChevronRight, CalendarClock, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildFormattedSheet, downloadXLSX, safeFileName } from '@/lib/excel-helpers';

interface ProfesoresUltimaVentaModalProps {
    isOpen: boolean;
    onClose: () => void;
    idSucursal: number | string | null;
    sucursalName: string;
    cutoffDate: string;
    onSaleClick: (sale: { id: number; folio: string; sucursalId: number; clienteName: string }) => void;
}

export default function ProfesoresUltimaVentaModal({
    isOpen,
    onClose,
    idSucursal,
    sucursalName,
    cutoffDate,
    onSaleClick
}: ProfesoresUltimaVentaModalProps) {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<Record<string, string>>({});
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'UltimaVentaRaw', direction: 'desc' });

    useEffect(() => {
        if (!isOpen || idSucursal === null) return;

        let isMounted = true;
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            setFilters({});

            try {
                const url = `/api/reportes/profesores-ultima-venta?cutoffDate=${cutoffDate}&sucursalId=${idSucursal}`;
                const response = await fetch(url);
                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Failed to fetch profesores');
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
    }, [isOpen, idSucursal, cutoffDate]);

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

                if (typeof valA === 'number' && typeof valB === 'number') {
                    return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
                }

                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [data, filters, sortConfig]);

    const formatCurrency = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return val;
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

    const totalUltimasVentas = useMemo(
        () => sortedAndFilteredData.reduce((acc, r) => acc + (Number(r.Total) || 0), 0),
        [sortedAndFilteredData]
    );

    const handleExportExcel = () => {
        if (sortedAndFilteredData.length === 0) return;
        const ws = buildFormattedSheet({
            title: `Profesores sin ventas recientes — ${sucursalName}`,
            meta: [
                { label: 'Sucursal:', value: sucursalName },
                { label: 'Última venta anterior a:', value: cutoffDate },
                { label: 'Profesores listados:', value: String(sortedAndFilteredData.length) },
                { label: 'Generado:', value: new Date().toLocaleString('es-MX') }
            ],
            columns: [
                { header: '#', key: '_idx', width: 6, align: 'center', isNumber: true },
                { header: 'Profesor', key: 'Cliente', width: 32 },
                { header: 'Disciplina', key: 'Disciplina', width: 22 },
                { header: 'Teléfono', key: 'Telefono', width: 18 },
                { header: 'Dirección', key: 'Direccion', width: 40 },
                { header: 'Sucursal', key: 'Sucursal', width: 24 },
                { header: 'Última Venta', key: 'UltimaVenta', width: 18, align: 'center' },
                { header: 'Folio', key: 'Folio', width: 16 },
                { header: 'Total', key: 'Total', width: 16, isCurrency: true, align: 'right' },
                { header: 'Días sin comprar', key: 'DiasSinComprar', width: 16, isNumber: true, align: 'right' }
            ],
            rows: sortedAndFilteredData.map((r, i) => ({
                _idx: i + 1,
                Cliente: r.Cliente,
                Disciplina: r.Disciplina || '—',
                Telefono: r.Telefono || '—',
                Direccion: r.Direccion || '—',
                Sucursal: r.Sucursal,
                UltimaVenta: r.UltimaVenta,
                Folio: r.Folio,
                Total: r.Total,
                DiasSinComprar: r.DiasSinComprar
            })),
            totalRow: {
                label: 'TOTAL',
                values: { Total: totalUltimasVentas }
            }
        });

        downloadXLSX(
            `Profesores_Ultima_Venta_${safeFileName(sucursalName)}_antes_de_${cutoffDate}.xlsx`,
            [{ name: 'Profesores', ws }]
        );
    };

    const handleExportPDF = () => {
        if (sortedAndFilteredData.length === 0) return;
        const doc = new jsPDF({ orientation: 'landscape' });

        doc.setFontSize(16);
        doc.text(`Profesores sin ventas recientes - ${sucursalName}`, 14, 20);
        doc.setFontSize(10);
        doc.text(`Última venta anterior a: ${cutoffDate}`, 14, 28);
        doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, 33);

        const tableColumn = ["Profesor", "Disciplina", "Teléfono", "Dirección", "Sucursal", "Última Venta", "Folio", "Total", "Días sin comprar"];
        const tableRows = sortedAndFilteredData.map(row => [
            row.Cliente,
            row.Disciplina || '—',
            row.Telefono || '—',
            row.Direccion || '—',
            row.Sucursal,
            formatShortDate(row.UltimaVentaRaw),
            row.Folio,
            formatCurrency(row.Total),
            String(row.DiasSinComprar ?? '—')
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 40,
            theme: 'striped',
            headStyles: { fillColor: [37, 99, 235] },
            styles: { fontSize: 8, cellPadding: 2.5 },
            columnStyles: {
                5: { halign: 'center' },
                7: { halign: 'right' },
                8: { halign: 'right' }
            }
        });

        doc.save(`Profesores_Ultima_Venta_${sucursalName.replace(/ /g, '_')}_antes_de_${cutoffDate}.pdf`);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50">
                    <div>
                        <div className="flex items-center gap-1 text-xs font-bold text-slate-400 select-none mb-1">
                            <button
                                onClick={onClose}
                                className="hover:text-blue-600 hover:underline transition-colors duration-150"
                            >
                                Sucursales
                            </button>
                            <ChevronRight size={12} className="text-slate-300" />
                            <span className="text-slate-850 font-extrabold">{sucursalName}</span>
                        </div>
                        <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-2 select-none">
                            <Users className="text-blue-600" size={24} />
                            Profesores de {sucursalName}
                        </h2>
                        <p className="text-xs font-semibold text-slate-500 mt-1 flex items-center gap-1.5">
                            <CalendarClock size={13} className="text-amber-500" />
                            Última venta anterior a {cutoffDate}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExportExcel}
                            disabled={loading || sortedAndFilteredData.length === 0}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-slate-200 disabled:opacity-40"
                            title="Exportar Excel"
                        >
                            <FileSpreadsheet size={20} />
                        </button>
                        <button
                            onClick={handleExportPDF}
                            disabled={loading || sortedAndFilteredData.length === 0}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-slate-200 disabled:opacity-40"
                            title="Exportar PDF"
                        >
                            <FileText size={20} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-2"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto bg-white">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                            <Loader2 className="animate-spin mb-4 text-blue-600" size={32} />
                            <p className="font-medium">Cargando profesores...</p>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-64 text-red-500">
                            <p className="font-medium">Error al cargar datos</p>
                            <p className="text-sm opacity-80 mt-1">{error}</p>
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
                            <thead className="bg-slate-50 sticky top-0 shadow-sm z-10 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group" onClick={() => handleSort('Cliente')}>
                                        <div className="flex items-center gap-1 justify-between">
                                            Profesor
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'Cliente' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group" onClick={() => handleSort('Disciplina')}>
                                        <div className="flex items-center gap-1 justify-between">
                                            Disciplina
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'Disciplina' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider select-none">Teléfono</th>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider select-none">Dirección</th>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group" onClick={() => handleSort('Sucursal')}>
                                        <div className="flex items-center gap-1 justify-between">
                                            Sucursal
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'Sucursal' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group text-center" onClick={() => handleSort('UltimaVentaRaw')}>
                                        <div className="flex items-center gap-1 justify-center">
                                            Última Venta
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'UltimaVentaRaw' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group" onClick={() => handleSort('Folio')}>
                                        <div className="flex items-center gap-1 justify-between">
                                            Folio
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'Folio' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group text-right" onClick={() => handleSort('Total')}>
                                        <div className="flex items-center gap-1 justify-end">
                                            Total Última Venta
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'Total' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group text-right" onClick={() => handleSort('DiasSinComprar')}>
                                        <div className="flex items-center gap-1 justify-end">
                                            Días sin Comprar
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'DiasSinComprar' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                </tr>
                                <tr className="bg-slate-50/80 backdrop-blur border-b border-slate-200">
                                    <th className="px-3 py-2">
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder={`Filtrar...`}
                                                value={filters['Cliente'] || ''}
                                                onChange={(e) => handleFilterChange('Cliente', e.target.value)}
                                                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 bg-white font-normal"
                                            />
                                            <Filter size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                        </div>
                                    </th>
                                    <th className="px-3 py-2">
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder={`Disciplina...`}
                                                value={filters['Disciplina'] || ''}
                                                onChange={(e) => handleFilterChange('Disciplina', e.target.value)}
                                                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 bg-white font-normal"
                                            />
                                            <Filter size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                        </div>
                                    </th>
                                    <th className="px-3 py-2"></th>
                                    <th className="px-3 py-2"></th>
                                    <th className="px-3 py-2">
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder={`Filtrar...`}
                                                value={filters['Sucursal'] || ''}
                                                onChange={(e) => handleFilterChange('Sucursal', e.target.value)}
                                                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 bg-white font-normal"
                                            />
                                            <Store size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                        </div>
                                    </th>
                                    <th className="px-3 py-2"></th>
                                    <th className="px-3 py-2">
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder={`Folio...`}
                                                value={filters['Folio'] || ''}
                                                onChange={(e) => handleFilterChange('Folio', e.target.value)}
                                                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 bg-white font-normal"
                                            />
                                            <Filter size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                        </div>
                                    </th>
                                    <th className="px-3 py-2"></th>
                                    <th className="px-3 py-2"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sortedAndFilteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                                            No se encontraron profesores con su última venta antes de la fecha indicada.
                                        </td>
                                    </tr>
                                ) : (
                                    sortedAndFilteredData.map((row, idx) => (
                                        <tr
                                            key={idx}
                                            className="hover:bg-blue-50/50 transition-colors group cursor-pointer"
                                            onClick={() => onSaleClick({ id: row.IdVenta, folio: row.Folio, sucursalId: row.IdSucursal, clienteName: row.Cliente })}
                                            title="Ver detalle de la última venta"
                                        >
                                            <td className="px-6 py-4 font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                                                {row.Cliente}
                                            </td>
                                            <td className="px-6 py-4 text-slate-600">
                                                {row.Disciplina || <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-6 py-4 text-slate-600 tabular-nums">
                                                {row.Telefono || <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 max-w-[240px] truncate" title={row.Direccion || ''}>
                                                {row.Direccion || <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 italic">
                                                {row.Sucursal}
                                            </td>
                                            <td className="px-6 py-4 text-center text-slate-600 text-xs tabular-nums">
                                                {formatShortDate(row.UltimaVentaRaw)}
                                            </td>
                                            <td className="px-6 py-4 font-mono text-blue-600 group-hover:underline flex items-center gap-1.5">
                                                <Receipt size={13} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                                                {row.Folio}
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold text-slate-800">
                                                {formatCurrency(row.Total)}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <span className={cn(
                                                    "font-bold text-[11px] px-2 py-0.5 rounded-full",
                                                    Number(row.DiasSinComprar) > 180
                                                        ? "bg-red-50 text-red-600 border border-red-100"
                                                        : Number(row.DiasSinComprar) > 90
                                                            ? "bg-amber-50 text-amber-600 border border-amber-100"
                                                            : "bg-slate-100 text-slate-500 border border-slate-200"
                                                )}>
                                                    {row.DiasSinComprar} días
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer summary */}
                {!loading && !error && sortedAndFilteredData.length > 0 && (
                    <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50 text-xs font-bold text-slate-500">
                        <span>{sortedAndFilteredData.length} profesor{sortedAndFilteredData.length === 1 ? '' : 'es'}</span>
                        <span className="text-slate-700">Suma últimas ventas: {formatCurrency(totalUltimasVentas)}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
