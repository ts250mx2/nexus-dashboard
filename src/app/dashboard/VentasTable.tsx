'use client';

import React, { useState, useMemo } from 'react';
import { ArrowUpDown, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSearchParams } from 'next/navigation';
import VentasDetailModal from '@/components/VentasDetailModal';

// Reuse the interface
interface SucursalData {
    id: number;
    sucursal: string;
    total: number;
    operaciones: number;
    aperturas: number;
    ticketPromedio: number;
}

interface VentasTableProps {
    data: SucursalData[];
    startDate: string;
    endDate: string;
}

type SortConfig = {
    key: keyof SucursalData;
    direction: 'asc' | 'desc';
} | null;

export default function VentasTable({ data, startDate, endDate }: VentasTableProps) {
    const [sortConfig, setSortConfig] = useState<SortConfig>(null);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSucursalId, setSelectedSucursalId] = useState<number>(0);
    const [selectedSucursalName, setSelectedSucursalName] = useState<string>('');

    const handleRowClick = (sucursalId: number, name: string) => {
        setSelectedSucursalId(sucursalId);
        setSelectedSucursalName(name);
        setIsModalOpen(true);
    };

    const handleSort = (key: keyof SucursalData) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedAndFilteredData = useMemo(() => {
        let result = [...data];

        // Sort
        if (sortConfig !== null) {
            result.sort((a, b) => {
                const valA = a[sortConfig.key];
                const valB = b[sortConfig.key];

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
    }, [data, sortConfig]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full">
            <div className="p-6 border-b border-slate-50 bg-gradient-to-r from-blue-50/50 to-white">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Store className="text-blue-500" size={20} />
                        <h2 className="text-lg font-bold text-slate-900">Ventas por Sucursal</h2>
                    </div>
                </div>
            </div>

            <div className="flex-1 p-0 overflow-y-auto w-full max-h-[500px]">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th
                                className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                                onClick={() => handleSort('sucursal')}
                            >
                                <div className="flex items-center gap-1">
                                    Sucursal
                                    <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'sucursal' && "opacity-100 text-blue-500")} />
                                </div>
                            </th>
                            <th
                                className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                                onClick={() => handleSort('total')}
                            >
                                <div className="flex items-center justify-end gap-1">
                                    Ventas ($)
                                    <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'total' && "opacity-100 text-blue-500")} />
                                </div>
                            </th>
                            <th
                                className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                                onClick={() => handleSort('operaciones')}
                            >
                                <div className="flex items-center justify-end gap-1">
                                    Ops
                                    <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'operaciones' && "opacity-100 text-blue-500")} />
                                </div>
                            </th>
                            <th
                                className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                                onClick={() => handleSort('ticketPromedio')}
                            >
                                <div className="flex items-center justify-end gap-1">
                                    T. Promedio
                                    <ArrowUpDown size={14} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'ticketPromedio' && "opacity-100 text-blue-500")} />
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 bg-white">
                        {sortedAndFilteredData.length > 0 ? (
                            sortedAndFilteredData.map((s) => (
                                <tr
                                    key={s.id}
                                    className="hover:bg-blue-50/50 transition-colors group cursor-pointer"
                                    onClick={() => handleRowClick(s.id, s.sucursal)}
                                >
                                    <td className="py-3 px-4 text-sm font-semibold text-slate-900">{s.sucursal}</td>
                                    <td className="py-3 px-4 text-sm text-slate-600 text-right font-medium">
                                        {formatCurrency(s.total)}
                                    </td>
                                    <td className="py-3 px-4 text-sm text-slate-600 text-right">{s.operaciones}</td>
                                    <td className="py-3 px-4 text-sm text-blue-600 text-right font-medium">
                                        {formatCurrency(s.ticketPromedio)}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={4} className="py-12 text-center text-sm text-slate-500 font-medium">
                                    <div className="flex flex-col items-center justify-center">
                                        <p>No se encontraron registros de ventas.</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <VentasDetailModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                sucursalId={selectedSucursalId}
                sucursalName={selectedSucursalName}
                startDate={startDate}
                endDate={endDate}
            />
        </div>
    );
}
