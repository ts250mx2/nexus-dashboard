'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { X, Download, FileSpreadsheet, Loader2, Store, Maximize, Minimize, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import VentasItemDetailModal from './VentasItemDetailModal';

interface VentasDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    sucursalId: number;
    sucursalName: string;
    startDate: string;
    endDate: string;
}

export default function VentasDetailModal({
    isOpen,
    onClose,
    sucursalId,
    sucursalName,
    startDate,
    endDate
}: VentasDetailModalProps) {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Nuevos estados
    const [isMaximized, setIsMaximized] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [filters, setFilters] = useState<Record<string, string>>({});

    // Estados para el Modal Anidado (Detalle de Ticket)
    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [selectedIdVenta, setSelectedIdVenta] = useState<number | null>(null);
    const [selectedFolioVenta, setSelectedFolioVenta] = useState<string>('');
    const [selectedClienteName, setSelectedClienteName] = useState<string>('');

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const sortedAndFilteredData = useMemo(() => {
        // Primero, aplicar filtros por columna
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

        // Segundo, aplicar ordenamiento
        if (sortConfig !== null) {
            result = [...result].sort((a, b) => {
                const valA = a[sortConfig.key];
                const valB = b[sortConfig.key];

                if (valA === null || valA === undefined) return 1;
                if (valB === null || valB === undefined) return -1;

                if (valA < valB) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (valA > valB) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }

        return result;
    }, [data, filters, sortConfig]);

    useEffect(() => {
        if (!isOpen || !sucursalId) return;

        let isMounted = true;
        const fetchData = async () => {
            setLoading(true);
            setError(null);

            try {
                const url = `/api/ventas-detalle?startDate=${startDate}&endDate=${endDate}&sucursalId=${sucursalId}`;
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

        return () => {
            isMounted = false;
        };
    }, [isOpen, sucursalId, startDate, endDate]);

    if (!isOpen) return null;

    const handleExportExcel = () => {
        if (sortedAndFilteredData.length === 0) return;

        // El usuario pidió explícitamente ocultar IdVenta e IdSucursal
        const exportData = sortedAndFilteredData.map(row => {
            const { IdVenta, IdSucursal, ...rest } = row;
            return rest;
        });

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "DetalleVentas");

        // Formato seguro del nombre de archivo
        const safeName = sucursalName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        XLSX.writeFile(workbook, `Ventas_${safeName}_${startDate}_al_${endDate}.xlsx`);
    };

    const formatCurrency = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return val;
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
    };

    // Obtener las llaves (columnas) para la tabla a partir del primer elemento, ignorando ocultas
    const cols = data.length > 0 ? Object.keys(data[0]).filter(k => k !== 'IdVenta' && k !== 'IdSucursal') : [];

    return (
        <div className={cn(
            "fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-300",
            isMaximized ? "p-0" : "p-4"
        )}>
            <div className={cn(
                "glass-panel shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 transition-all border border-slate-200/50 backdrop-blur-2xl bg-white/95",
                isMaximized ? "w-full h-[100dvh] max-w-none rounded-none" : "rounded-2xl w-full max-w-6xl max-h-[90vh]"
            )}>

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-200/40 bg-gradient-to-r from-slate-50/40 to-transparent">
                    <div>
                        <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2.5">
                            <div className="p-2 bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 rounded-xl">
                                <Store size={20} strokeWidth={2.2} />
                            </div>
                            <span className="uppercase tracking-wider">Detalle de Ventas - {sucursalName}</span>
                        </h2>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Periodo: {startDate} al {endDate}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleExportExcel}
                            disabled={loading || data.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-bold text-xs uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-500/10"
                        >
                            <FileSpreadsheet size={16} />
                            Exportar Excel
                        </button>
                        <button
                            onClick={() => setIsMaximized(!isMaximized)}
                            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-500/10 hover:border-indigo-500/20 border border-transparent rounded-xl transition-all cursor-pointer"
                            title={isMaximized ? "Restaurar" : "Maximizar"}
                        >
                            {isMaximized ? <Minimize size={18} /> : <Maximize size={18} />}
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/20 border border-transparent rounded-xl transition-all cursor-pointer"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto p-0 bg-transparent">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                            <Loader2 className="animate-spin mb-4 text-indigo-500" size={32} />
                            <p className="text-xs font-bold uppercase tracking-wider">Cargando registros...</p>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-64 text-red-500">
                            <p className="font-bold uppercase tracking-wider">Error al cargar datos</p>
                            <p className="text-xs font-semibold opacity-80 mt-1">{error}</p>
                        </div>
                    ) : sortedAndFilteredData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                            <p className="font-bold uppercase tracking-wider text-slate-400">No se encontraron resultados</p>
                            <p className="text-xs font-semibold mt-1">Intenta ajustando los filtros de las columnas.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
                            <thead className="bg-slate-50/50 sticky top-0 shadow-sm z-10 backdrop-blur-md border-b border-slate-200/50">
                                <tr>
                                    {cols.map(col => (
                                        <th
                                            key={`th-${col}`}
                                            className="px-5 py-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-indigo-50/30 transition-colors select-none group"
                                            onClick={() => handleSort(col)}
                                        >
                                            <div className="flex items-center gap-1.5 justify-between">
                                                {col}
                                                <ArrowUpDown size={12} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === col && "opacity-100 text-indigo-500")} />
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                                <tr className="bg-slate-50/20 border-b border-slate-200/40">
                                    {cols.map(col => (
                                        <th key={`filter-${col}`} className="px-3 py-2 font-normal">
                                            <input
                                                type="text"
                                                placeholder={`Filtrar...`}
                                                value={filters[col] || ''}
                                                onChange={(e) => handleFilterChange(col, e.target.value)}
                                                className="w-full min-w-[100px] px-3 py-1.5 text-xs border border-slate-200/60 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 bg-slate-50/80 hover:border-slate-300 font-semibold text-slate-700 transition-all"
                                            />
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100/60 bg-transparent">
                                {sortedAndFilteredData.map((row, idx) => (
                                    <tr
                                        key={idx}
                                        className="hover:bg-indigo-500/5 transition-all duration-200 group cursor-pointer"
                                        onClick={() => {
                                            setSelectedIdVenta(row.IdVenta);
                                            setSelectedFolioVenta(row['Folio Venta'] || 'Desconocido');
                                            setSelectedClienteName(row.Cliente || '');
                                            setIsItemModalOpen(true);
                                        }}
                                    >
                                        {cols.map(col => {
                                            const val = row[col];
                                            const isCurrency = col.toLowerCase().includes('total') || col.toLowerCase().includes('pago');

                                            return (
                                                <td key={col} className={cn(
                                                    "px-5 py-3 text-xs",
                                                    isCurrency ? "text-right font-bold text-slate-800" : "text-slate-600 font-semibold"
                                                )}>
                                                    {val !== null && val !== undefined ? (isCurrency ? formatCurrency(val) : val) : '-'}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

            </div>

            <VentasItemDetailModal
                isOpen={isItemModalOpen}
                onClose={() => setIsItemModalOpen(false)}
                idVenta={selectedIdVenta}
                idSucursal={sucursalId}
                folioVenta={selectedFolioVenta}
                clienteName={selectedClienteName}
            />

        </div>
    );
}
