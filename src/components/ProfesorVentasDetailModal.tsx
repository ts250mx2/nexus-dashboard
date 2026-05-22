'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { X, FileSpreadsheet, Loader2, Store, FileText, ArrowUpDown, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildFormattedSheet, downloadXLSX, safeFileName } from '@/lib/excel-helpers';

interface ProfesorVentasDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    idSocio: number | null;
    socioName: string;
    startDate: string;
    endDate: string;
    sucursalId: string;
    sucursalName: string;
    onSaleClick: (sale: { id: number; folio: string; sucursalId: number }) => void;
    onGoBackToBranches?: () => void;
}

export default function ProfesorVentasDetailModal({
    isOpen,
    onClose,
    idSocio,
    socioName,
    startDate,
    endDate,
    sucursalId,
    sucursalName,
    onSaleClick,
    onGoBackToBranches
}: ProfesorVentasDetailModalProps) {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'Fecha', direction: 'desc' });
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen) {
            setSearchTerm('');
        }
    }, [isOpen, idSocio]);

    useEffect(() => {
        if (!isOpen || !idSocio) return;

        let isMounted = true;
        const fetchData = async () => {
            setLoading(true);
            setError(null);

            try {
                const url = `/api/reportes/profesores/detalle?idSocio=${idSocio}&startDate=${startDate}&endDate=${endDate}&sucursalId=${sucursalId}`;
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
    }, [isOpen, idSocio, startDate, endDate, sucursalId]);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const filteredData = useMemo(() => {
        return data.filter(item => 
            item.Folio.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [data, searchTerm]);

    const sortedData = useMemo(() => {
        if (sortConfig === null) return filteredData;
        return [...filteredData].sort((a, b) => {
            const valA = a[sortConfig.key];
            const valB = b[sortConfig.key];
            if (valA === valB) return 0;
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            return sortConfig.direction === 'asc' ? 1 : -1;
        });
    }, [filteredData, sortConfig]);

    const totalVentas = useMemo(
        () => sortedData.reduce((acc, r) => acc + (Number(r.Total) || 0), 0),
        [sortedData]
    );

    if (!isOpen) return null;

    const formatCurrency = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return val;
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
    };

    /** Excel formateado: tabla con encabezado + total. */
    const handleExportExcel = () => {
        if (sortedData.length === 0) return;
        const ws = buildFormattedSheet({
            title: `Ventas de ${socioName}`,
            meta: [
                { label: 'Profesor:', value: socioName },
                { label: 'Sucursal:', value: sucursalName || 'Todas las Sucursales' },
                { label: 'Periodo:', value: `${startDate} al ${endDate}` }
            ],
            columns: [
                { header: 'Folio', key: 'Folio', width: 18 },
                { header: 'Fecha', key: 'Fecha', width: 18 },
                { header: 'Sucursal', key: 'Sucursal', width: 28 },
                { header: 'Cajero', key: 'Cajero', width: 22 },
                { header: 'Total', key: 'Total', width: 16, isCurrency: true, align: 'right' }
            ],
            rows: sortedData.map(r => ({
                Folio: r.Folio,
                Fecha: r.Fecha,
                Sucursal: r.Sucursal,
                Cajero: r.Cajero || '—',
                Total: r.Total
            })),
            totalRow: {
                label: 'TOTAL',
                values: { Total: totalVentas }
            }
        });
        downloadXLSX(
            `Ventas_${safeFileName(socioName)}_${startDate}_al_${endDate}.xlsx`,
            [{ name: 'Ventas', ws }]
        );
    };

    const handleExportPDF = () => {
        if (data.length === 0) return;
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.text(`Detalle de Ventas - ${socioName}`, 14, 20);
        doc.setFontSize(10);
        doc.text(`Periodo: ${startDate} al ${endDate}`, 14, 28);
        doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, 33);

        const tableColumn = ["Folio", "Fecha", "Sucursal", "Cajero", "Total"];
        const tableRows = sortedData.map(row => [
            row.Folio,
            row.Fecha,
            row.Sucursal,
            row.Cajero || '—',
            formatCurrency(row.Total)
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 40,
            theme: 'grid',
            headStyles: { fillColor: [37, 99, 235] },
            columnStyles: {
                4: { halign: 'right' }
            }
        });

        doc.save(`Ventas_${socioName.replace(/ /g, '_')}_${startDate}_al_${endDate}.pdf`);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50">
                    <div>
                        <div className="flex items-center gap-1 text-xs font-bold text-slate-400 select-none mb-1">
                            <button
                                onClick={onGoBackToBranches || onClose}
                                className="hover:text-blue-600 hover:underline transition-colors duration-150"
                            >
                                Sucursales
                            </button>
                            <ChevronRight size={12} className="text-slate-300" />
                            <button
                                onClick={onClose}
                                className="hover:text-blue-600 hover:underline transition-colors duration-150"
                            >
                                {sucursalName || 'Sucursal'}
                            </button>
                            <ChevronRight size={12} className="text-slate-300" />
                            <span className="text-slate-850 font-extrabold">{socioName}</span>
                        </div>
                        <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-2 select-none">
                            <Store className="text-blue-600" size={24} />
                            Ventas de {socioName}
                        </h2>
                        <p className="text-xs font-semibold text-slate-500 mt-1">Periodo: {startDate} al {endDate}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Search Input for Folio */}
                        {!loading && !error && data.length > 0 && (
                            <div className="relative flex items-center bg-white border border-slate-200 rounded-lg px-2.5 py-1 focus-within:ring-2 focus-within:ring-blue-500/10 focus-within:border-blue-500 transition-all w-40 sm:w-48 mr-2">
                                <Search size={14} className="text-slate-400 mr-1.5 shrink-0" />
                                <input
                                    type="text"
                                    placeholder="Buscar folio..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="bg-transparent text-xs font-semibold text-slate-700 outline-none p-0 border-none h-auto w-full"
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="p-0.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-650"
                                    >
                                        <X size={10} />
                                    </button>
                                )}
                            </div>
                        )}
                        <button
                            onClick={handleExportExcel}
                            disabled={loading || sortedData.length === 0}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-slate-200 disabled:opacity-40"
                            title="Exportar Excel"
                        >
                            <FileSpreadsheet size={20} />
                        </button>
                        <button
                            onClick={handleExportPDF}
                            disabled={loading || sortedData.length === 0}
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
                <div className="flex-1 overflow-auto bg-white p-0">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                            <Loader2 className="animate-spin mb-4" size={32} />
                            <p>Obteniendo detalles...</p>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-64 text-red-500">
                            <p className="font-medium">Error al cargar datos</p>
                            <p className="text-sm opacity-80 mt-1">{error}</p>
                        </div>
                    ) : data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500 text-center px-6">
                            <p className="font-medium">No hay ventas registradas para este socio en el periodo seleccionado.</p>
                        </div>
                    ) : filteredData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500 text-center px-6">
                            <p className="font-medium">No se encontraron ventas que coincidan con su búsqueda de folio.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
                            <thead className="bg-slate-50 sticky top-0 shadow-sm z-10 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-3 font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group" onClick={() => handleSort('Folio')}>
                                        <div className="flex items-center gap-1 justify-between">
                                            Folio
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'Folio' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-3 font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group" onClick={() => handleSort('Fecha')}>
                                        <div className="flex items-center gap-1 justify-between">
                                            Fecha
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'Fecha' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-3 font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group" onClick={() => handleSort('Sucursal')}>
                                        <div className="flex items-center gap-1 justify-between">
                                            Sucursal
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'Sucursal' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-3 font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group" onClick={() => handleSort('Cajero')}>
                                        <div className="flex items-center gap-1 justify-between">
                                            Cajero
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'Cajero' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-3 font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group text-right" onClick={() => handleSort('Total')}>
                                        <div className="flex items-center gap-1 justify-end">
                                            Total
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'Total' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sortedData.map((row, idx) => (
                                    <tr 
                                        key={idx} 
                                        className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                        onClick={() => onSaleClick({ id: row.IdVenta, folio: row.Folio, sucursalId: row.IdSucursal })}
                                    >
                                        <td className="px-6 py-3 font-mono text-blue-600 group-hover:underline">{row.Folio}</td>
                                        <td className="px-6 py-3 text-slate-600">{row.Fecha}</td>
                                        <td className="px-6 py-3 text-slate-600">{row.Sucursal}</td>
                                        <td className="px-6 py-3 text-slate-600">{row.Cajero || '—'}</td>
                                        <td className="px-6 py-3 text-right font-bold text-slate-800">{formatCurrency(row.Total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
