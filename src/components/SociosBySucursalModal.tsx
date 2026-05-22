'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { X, Loader2, Users, ArrowUpDown, Filter, TrendingUp, FileSpreadsheet, FileText, Store, ChevronRight, FileBarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    buildFormattedSheet,
    downloadXLSX,
    safeFileName,
    setCell,
    fixRange,
    rowStyle,
    totalStyle,
    STYLE_TITLE,
    STYLE_HEADER,
    STYLE_META_LABEL,
    STYLE_META_VALUE,
    STYLE_SUBTITLE,
    FORMAT_CURRENCY,
    FORMAT_INT
} from '@/lib/excel-helpers';

interface SociosBySucursalModalProps {
    isOpen: boolean;
    onClose: () => void;
    idSucursal: number | string | null;
    sucursalName: string;
    startDate: string;
    endDate: string;
    onSocioClick: (socio: { id: number; name: string }) => void;
}

export default function SociosBySucursalModal({
    isOpen,
    onClose,
    idSucursal,
    sucursalName,
    startDate,
    endDate,
    onSocioClick
}: SociosBySucursalModalProps) {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<Record<string, string>>({});
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'ImporteTotal', direction: 'desc' });
    const [exportingDetalle, setExportingDetalle] = useState(false);

    useEffect(() => {
        if (!isOpen || !idSucursal) return;

        let isMounted = true;
        const fetchData = async () => {
            setLoading(true);
            setError(null);

            try {
                const url = `/api/reportes/profesores?startDate=${startDate}&endDate=${endDate}&sucursalId=${idSucursal}`;
                const response = await fetch(url);
                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Failed to fetch socios');
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
    }, [isOpen, idSucursal, startDate, endDate]);

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

    const handleExportExcel = () => {
        if (sortedAndFilteredData.length === 0) return;

        const totalImporte = sortedAndFilteredData.reduce((acc, r) => acc + (Number(r.ImporteTotal) || 0), 0);
        const totalVentas = sortedAndFilteredData.reduce((acc, r) => acc + (Number(r.TotalVentas) || 0), 0);

        const ws = buildFormattedSheet({
            title: `Profesores — ${sucursalName}`,
            meta: [
                { label: 'Sucursal:', value: sucursalName },
                { label: 'Periodo:', value: `${startDate} al ${endDate}` },
                { label: 'Profesores listados:', value: String(sortedAndFilteredData.length) },
                { label: 'Generado:', value: new Date().toLocaleString('es-MX') }
            ],
            columns: [
                { header: '#', key: '_idx', width: 6, align: 'center', isNumber: true },
                { header: 'Profesor', key: 'Cliente', width: 36 },
                { header: 'Sucursal', key: 'Sucursal', width: 24 },
                { header: 'Ventas', key: 'TotalVentas', width: 10, isNumber: true, align: 'right' },
                { header: 'Ticket Promedio', key: 'TicketPromedio', width: 18, isCurrency: true, align: 'right' },
                { header: 'Importe Total', key: 'ImporteTotal', width: 18, isCurrency: true, align: 'right' },
                { header: 'Última Venta', key: 'UltimaVenta', width: 16, align: 'center' }
            ],
            rows: sortedAndFilteredData.map((r, i) => ({
                _idx: i + 1,
                Cliente: r.Cliente,
                Sucursal: r.Sucursal,
                TotalVentas: r.TotalVentas,
                TicketPromedio: r.TicketPromedio,
                ImporteTotal: r.ImporteTotal,
                UltimaVenta: r.UltimaVenta ? formatShortDate(r.UltimaVenta) : '—'
            })),
            totalRow: {
                label: 'TOTAL',
                values: { TotalVentas: totalVentas, ImporteTotal: totalImporte }
            }
        });

        downloadXLSX(
            `Reporte_Profesores_${safeFileName(sucursalName)}_${startDate}_al_${endDate}.xlsx`,
            [{ name: 'Profesores', ws }]
        );
    };

    /**
     * Excel con detalle: Hoja 1 resumen de profesores + Hoja 2 con todas las ventas
     * agrupadas por profesor (cabecera por profesor + sus tickets + subtotal),
     * para que el archivo cuente "la historia completa" del periodo en una sucursal.
     */
    const handleExportExcelDetalle = async () => {
        if (sortedAndFilteredData.length === 0) return;
        setExportingDetalle(true);
        try {
            // 1) Trae las ventas de TODOS los profesores en un solo request
            const sucursalParam = idSucursal === 'all' || idSucursal === null ? 'all' : String(idSucursal);
            const url = `/api/reportes/profesores/detalle-completo?startDate=${startDate}&endDate=${endDate}&sucursalId=${sucursalParam}`;
            const resp = await fetch(url);
            const json = await resp.json();
            if (!resp.ok) throw new Error(json.error || 'Error al obtener detalle');
            const ventas: any[] = json.data || [];

            // 2) Agrupa ventas por IdSocio
            const ventasPorSocio = new Map<number, any[]>();
            for (const v of ventas) {
                const arr = ventasPorSocio.get(v.IdSocio) || [];
                arr.push(v);
                ventasPorSocio.set(v.IdSocio, arr);
            }

            // 3) Hoja 1: Resumen (igual al export simple, recicla el helper)
            const totalImporte = sortedAndFilteredData.reduce((acc, r) => acc + (Number(r.ImporteTotal) || 0), 0);
            const totalVentasCount = sortedAndFilteredData.reduce((acc, r) => acc + (Number(r.TotalVentas) || 0), 0);
            const wsResumen = buildFormattedSheet({
                title: `Profesores — ${sucursalName}`,
                meta: [
                    { label: 'Sucursal:', value: sucursalName },
                    { label: 'Periodo:', value: `${startDate} al ${endDate}` },
                    { label: 'Profesores listados:', value: String(sortedAndFilteredData.length) },
                    { label: 'Generado:', value: new Date().toLocaleString('es-MX') }
                ],
                columns: [
                    { header: '#', key: '_idx', width: 6, align: 'center', isNumber: true },
                    { header: 'Profesor', key: 'Cliente', width: 36 },
                    { header: 'Sucursal', key: 'Sucursal', width: 24 },
                    { header: 'Ventas', key: 'TotalVentas', width: 10, isNumber: true, align: 'right' },
                    { header: 'Ticket Promedio', key: 'TicketPromedio', width: 18, isCurrency: true, align: 'right' },
                    { header: 'Importe Total', key: 'ImporteTotal', width: 18, isCurrency: true, align: 'right' }
                ],
                rows: sortedAndFilteredData.map((r, i) => ({
                    _idx: i + 1,
                    Cliente: r.Cliente,
                    Sucursal: r.Sucursal,
                    TotalVentas: r.TotalVentas,
                    TicketPromedio: r.TicketPromedio,
                    ImporteTotal: r.ImporteTotal
                })),
                totalRow: {
                    label: 'TOTAL',
                    values: { TotalVentas: totalVentasCount, ImporteTotal: totalImporte }
                }
            });

            // 4) Hoja 2: Detalle agrupado por profesor (encabezado + ventas + subtotal)
            const ws: any = {};
            ws['!merges'] = [];
            ws['!rows'] = [];
            const NUM_COLS = 6; // #, Folio, Fecha, Sucursal, Cajero, Total
            let r = 0;

            // Título
            setCell(ws, r, 0, `Detalle de ventas por profesor — ${sucursalName}`, STYLE_TITLE);
            ws['!merges'].push({ s: { r, c: 0 }, e: { r, c: NUM_COLS - 1 } });
            ws['!rows'][r] = { hpt: 28 };
            r++;
            r++; // separador

            // Metadata
            const meta = [
                { label: 'Sucursal:', value: sucursalName },
                { label: 'Periodo:', value: `${startDate} al ${endDate}` },
                { label: 'Profesores con ventas:', value: String(ventasPorSocio.size) },
                { label: 'Tickets totales:', value: String(ventas.length) },
                { label: 'Generado:', value: new Date().toLocaleString('es-MX') }
            ];
            for (const m of meta) {
                setCell(ws, r, 0, m.label, STYLE_META_LABEL);
                setCell(ws, r, 1, m.value, STYLE_META_VALUE);
                ws['!merges'].push({ s: { r, c: 1 }, e: { r, c: NUM_COLS - 1 } });
                r++;
            }
            r++; // separador

            // Recorre profesores en el mismo orden que el modal
            let grandTotal = 0;
            for (const socio of sortedAndFilteredData) {
                const sus = ventasPorSocio.get(socio.IdSocio) || [];
                const subtotal = sus.reduce((acc, v) => acc + (Number(v.Total) || 0), 0);
                grandTotal += subtotal;

                // Banner del profesor (subtitle)
                setCell(ws, r, 0, `${socio.Cliente}  ·  ${sus.length} venta${sus.length === 1 ? '' : 's'}  ·  ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(subtotal)}`, STYLE_SUBTITLE);
                ws['!merges'].push({ s: { r, c: 0 }, e: { r, c: NUM_COLS - 1 } });
                ws['!rows'][r] = { hpt: 20 };
                r++;

                if (sus.length === 0) {
                    setCell(ws, r, 0, 'Sin ventas en el periodo', { ...STYLE_META_VALUE, alignment: { horizontal: 'center', vertical: 'center' } });
                    ws['!merges'].push({ s: { r, c: 0 }, e: { r, c: NUM_COLS - 1 } });
                    r++;
                    r++;
                    continue;
                }

                // Header de tabla
                const headers = ['#', 'Folio', 'Fecha', 'Sucursal', 'Cajero', 'Total'];
                headers.forEach((h, c) => setCell(ws, r, c, h, STYLE_HEADER));
                ws['!rows'][r] = { hpt: 20 };
                r++;

                // Filas
                sus.forEach((v, i) => {
                    setCell(ws, r, 0, i + 1, rowStyle(i, 'center'), FORMAT_INT);
                    setCell(ws, r, 1, v.Folio || '', rowStyle(i, 'left'));
                    setCell(ws, r, 2, v.Fecha || '', rowStyle(i, 'left'));
                    setCell(ws, r, 3, v.Sucursal || '', rowStyle(i, 'left'));
                    setCell(ws, r, 4, v.Cajero || '', rowStyle(i, 'left'));
                    setCell(ws, r, 5, Number(v.Total) || 0, rowStyle(i, 'right'), FORMAT_CURRENCY);
                    r++;
                });

                // Subtotal del profesor
                setCell(ws, r, 0, '', totalStyle('left'));
                setCell(ws, r, 1, '', totalStyle('left'));
                setCell(ws, r, 2, '', totalStyle('left'));
                setCell(ws, r, 3, '', totalStyle('left'));
                setCell(ws, r, 4, 'Subtotal', totalStyle('right'));
                setCell(ws, r, 5, subtotal, totalStyle('right'), FORMAT_CURRENCY);
                r++;
                r++; // separador entre profesores
            }

            // Total general
            setCell(ws, r, 0, '', totalStyle('left'));
            setCell(ws, r, 1, '', totalStyle('left'));
            setCell(ws, r, 2, '', totalStyle('left'));
            setCell(ws, r, 3, '', totalStyle('left'));
            setCell(ws, r, 4, 'TOTAL GENERAL', totalStyle('right'));
            setCell(ws, r, 5, grandTotal, totalStyle('right'), FORMAT_CURRENCY);
            ws['!rows'][r] = { hpt: 22 };

            // Anchos de columna
            ws['!cols'] = [
                { wch: 6 },   // #
                { wch: 18 },  // Folio
                { wch: 20 },  // Fecha
                { wch: 28 },  // Sucursal
                { wch: 22 },  // Cajero
                { wch: 18 }   // Total
            ];

            fixRange(ws, r, NUM_COLS - 1);

            downloadXLSX(
                `Detalle_Profesores_${safeFileName(sucursalName)}_${startDate}_al_${endDate}.xlsx`,
                [
                    { name: 'Resumen', ws: wsResumen },
                    { name: 'Detalle por venta', ws }
                ]
            );
        } catch (err: any) {
            console.error('Error exportando detalle:', err);
            alert(`No se pudo generar el Excel con detalle: ${err.message || err}`);
        } finally {
            setExportingDetalle(false);
        }
    };

    const handleExportPDF = () => {
        if (sortedAndFilteredData.length === 0) return;
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.text(`Socios - ${sucursalName}`, 14, 20);
        doc.setFontSize(10);
        doc.text(`Periodo: ${startDate} al ${endDate}`, 14, 28);
        doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, 33);

        const tableColumn = ["Profesor", "Sucursal", "# Ventas", "T. Promedio", "Importe Total", "Última Venta"];
        const tableRows = sortedAndFilteredData.map(row => [
            row.Cliente,
            row.Sucursal,
            row.TotalVentas,
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
            columnStyles: {
                2: { halign: 'center' },
                3: { halign: 'right' },
                4: { halign: 'right' },
                5: { halign: 'center' }
            }
        });

        doc.save(`Reporte_Profesores_${sucursalName.replace(/ /g, '_')}_${startDate}_al_${endDate}.pdf`);
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
                        <p className="text-xs font-semibold text-slate-500 mt-1">Periodo: {startDate} al {endDate}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExportExcel}
                            disabled={loading || data.length === 0}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-slate-200 disabled:opacity-40"
                            title="Exportar Excel (resumen de profesores)"
                        >
                            <FileSpreadsheet size={20} />
                        </button>
                        <button
                            onClick={handleExportExcelDetalle}
                            disabled={loading || data.length === 0 || exportingDetalle}
                            className="flex items-center gap-1.5 px-3 py-2 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200 text-xs font-bold disabled:opacity-40"
                            title="Exportar Excel con encabezado por profesor y desglose de sus ventas"
                        >
                            {exportingDetalle ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <FileBarChart2 size={16} />
                            )}
                            <span className="hidden sm:inline">{exportingDetalle ? 'Generando...' : 'Excel con detalle'}</span>
                        </button>
                        <button
                            onClick={handleExportPDF}
                            disabled={loading || data.length === 0}
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
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group" onClick={() => handleSort('Sucursal')}>
                                        <div className="flex items-center gap-1 justify-between">
                                            Sucursal
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'Sucursal' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group text-center" onClick={() => handleSort('TotalVentas')}>
                                        <div className="flex items-center gap-1 justify-center">
                                            # Ventas
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'TotalVentas' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group text-right" onClick={() => handleSort('TicketPromedio')}>
                                        <div className="flex items-center gap-1 justify-end">
                                            Ticket Promedio
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'TicketPromedio' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group text-right" onClick={() => handleSort('ImporteTotal')}>
                                        <div className="flex items-center gap-1 justify-end">
                                            Importe Total
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'ImporteTotal' && "opacity-100 text-blue-500")} />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group text-center" onClick={() => handleSort('UltimaVenta')}>
                                        <div className="flex items-center gap-1 justify-center">
                                            Última Venta
                                            <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'UltimaVenta' && "opacity-100 text-blue-500")} />
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
                                                placeholder={`Filtrar...`}
                                                value={filters['Sucursal'] || ''}
                                                onChange={(e) => handleFilterChange('Sucursal', e.target.value)}
                                                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 bg-white font-normal"
                                            />
                                            <Store size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                        </div>
                                    </th>
                                    <th className="px-3 py-2"></th>
                                    <th className="px-3 py-2"></th>
                                    <th className="px-3 py-2"></th>
                                    <th className="px-3 py-2"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sortedAndFilteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                            No se encontraron socios para esta sucursal.
                                        </td>
                                    </tr>
                                ) : (
                                    sortedAndFilteredData.map((row, idx) => (
                                        <tr
                                            key={idx}
                                            className="hover:bg-blue-50/50 transition-colors group cursor-pointer"
                                            onClick={() => onSocioClick({ id: row.IdSocio, name: row.Cliente })}
                                        >
                                            <td className="px-6 py-4 font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                                                {row.Cliente}
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 italic">
                                                {row.Sucursal}
                                            </td>
                                            <td className="px-6 py-4 text-center text-slate-600 font-mono">
                                                {row.TotalVentas}
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
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
