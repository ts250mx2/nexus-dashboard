'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { X, Loader2, Users, ArrowUpDown, Filter, TrendingUp, FileSpreadsheet, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

    const handleExportExcel = () => {
        if (sortedAndFilteredData.length === 0) return;
        const worksheet = XLSX.utils.json_to_sheet(sortedAndFilteredData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Socios");
        XLSX.writeFile(workbook, `Socios_${sucursalName.replace(/ /g, '_')}_${startDate}_al_${endDate}.xlsx`);
    };

    const handleExportPDF = () => {
        if (sortedAndFilteredData.length === 0) return;
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.text(`Socios - ${sucursalName}`, 14, 20);
        doc.setFontSize(10);
        doc.text(`Periodo: ${startDate} al ${endDate}`, 14, 28);
        doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, 33);

        const tableColumn = ["Profesor", "# Ventas", "Ticket Promedio", "Importe Total"];
        const tableRows = sortedAndFilteredData.map(row => [
            row.Cliente,
            row.TotalVentas,
            formatCurrency(row.TicketPromedio),
            formatCurrency(row.ImporteTotal)
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 40,
            theme: 'striped',
            headStyles: { fillColor: [37, 99, 235] },
            columnStyles: {
                1: { halign: 'center' },
                2: { halign: 'right' },
                3: { halign: 'right' }
            }
        });

        doc.save(`Socios_${sucursalName.replace(/ /g, '_')}_${startDate}_al_${endDate}.pdf`);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Users className="text-blue-600" size={24} />
                            Profesores de {sucursalName}
                        </h2>
                        <p className="text-sm text-slate-500 mt-1">Periodo: {startDate} al {endDate}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExportExcel}
                            disabled={loading || data.length === 0}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-slate-200"
                        >
                            <FileSpreadsheet size={20} />
                        </button>
                        <button
                            onClick={handleExportPDF}
                            disabled={loading || data.length === 0}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-slate-200"
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
                                    <th className="px-3 py-2"></th>
                                    <th className="px-3 py-2"></th>
                                    <th className="px-3 py-2"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sortedAndFilteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
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
