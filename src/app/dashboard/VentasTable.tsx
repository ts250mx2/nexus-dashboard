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
        <>
            <div className="glass-panel rounded-2xl shadow-xl border border-slate-200/50 overflow-hidden flex flex-col h-full backdrop-blur-md">
                <div className="p-6 border-b border-slate-200/40 bg-gradient-to-r from-slate-50/40 to-transparent">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 rounded-xl">
                                <Store size={18} strokeWidth={2.2} />
                            </div>
                            <div>
                                <h2 className="text-base font-extrabold text-slate-800 uppercase tracking-wider">Ventas por Sucursal</h2>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Rendimiento Detallado</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 p-0 overflow-y-auto w-full max-h-[500px]">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50/50 sticky top-0 z-10 shadow-sm backdrop-blur-md">
                            <tr>
                                <th
                                    className="py-3.5 px-5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-200/50 cursor-pointer hover:bg-indigo-50/30 transition-colors"
                                    onClick={() => handleSort('sucursal')}
                                >
                                    <div className="flex items-center gap-1.5">
                                        Sucursal
                                        <ArrowUpDown size={12} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'sucursal' && "opacity-100 text-indigo-500")} />
                                    </div>
                                </th>
                                <th
                                    className="py-3.5 px-5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-200/50 text-right cursor-pointer hover:bg-indigo-50/30 transition-colors"
                                    onClick={() => handleSort('total')}
                                >
                                    <div className="flex items-center justify-end gap-1.5">
                                        Ventas ($)
                                        <ArrowUpDown size={12} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'total' && "opacity-100 text-indigo-500")} />
                                    </div>
                                </th>
                                <th
                                    className="py-3.5 px-5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-200/50 text-right cursor-pointer hover:bg-indigo-50/30 transition-colors"
                                    onClick={() => handleSort('operaciones')}
                                >
                                    <div className="flex items-center justify-end gap-1.5">
                                        Ops
                                        <ArrowUpDown size={12} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'operaciones' && "opacity-100 text-indigo-500")} />
                                    </div>
                                </th>
                                <th
                                    className="py-3.5 px-5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-200/50 text-right cursor-pointer hover:bg-indigo-50/30 transition-colors"
                                    onClick={() => handleSort('ticketPromedio')}
                                >
                                    <div className="flex items-center justify-end gap-1.5">
                                        T. Promedio
                                        <ArrowUpDown size={12} className={cn("text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity", sortConfig?.key === 'ticketPromedio' && "opacity-100 text-indigo-500")} />
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/55 bg-transparent">
                            {sortedAndFilteredData.length > 0 ? (
                                sortedAndFilteredData.map((s) => (
                                    <tr
                                        key={s.id}
                                        className="hover:bg-indigo-500/5 transition-all duration-200 group cursor-pointer"
                                        onClick={() => handleRowClick(s.id, s.sucursal)}
                                    >
                                        <td className="py-3.5 px-5 text-sm font-extrabold text-slate-700 group-hover:text-indigo-600 transition-colors">{s.sucursal}</td>
                                        <td className="py-3.5 px-5 text-sm text-slate-800 text-right font-bold">
                                            {formatCurrency(s.total)}
                                        </td>
                                        <td className="py-3.5 px-5 text-sm text-slate-500 font-semibold text-right">{s.operaciones}</td>
                                        <td className="py-3.5 px-5 text-sm text-indigo-600 text-right font-bold">
                                            {formatCurrency(s.ticketPromedio)}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className="py-12 text-center text-sm text-slate-400 font-bold">
                                        <div className="flex flex-col items-center justify-center">
                                            <p>No se encontraron registros de ventas.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <VentasDetailModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                sucursalId={selectedSucursalId}
                sucursalName={selectedSucursalName}
                startDate={startDate}
                endDate={endDate}
            />
        </>
    );
}
