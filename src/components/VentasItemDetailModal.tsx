'use client';

import React, { useEffect, useState } from 'react';
import { X, Loader2, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VentasItemDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    idVenta: number | null;
    idSucursal: number | null;
    folioVenta: string;
    clienteName: string;
}

export default function VentasItemDetailModal({
    isOpen,
    onClose,
    idVenta,
    idSucursal,
    folioVenta,
    clienteName
}: VentasItemDetailModalProps) {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !idVenta || !idSucursal) return;

        let isMounted = true;
        const fetchData = async () => {
            setLoading(true);
            setError(null);

            try {
                const url = `/api/ventas-items?idVenta=${idVenta}&idSucursal=${idSucursal}`;
                const response = await fetch(url);
                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Failed to fetch ticket items');
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
    }, [isOpen, idVenta, idSucursal]);

    if (!isOpen) return null;

    const formatCurrency = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return val;
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
    };

    // Calcular totales para la fila resumen inferior
    const totalTicket = data.reduce((acc, current) => acc + (Number(current.Total) || 0), 0);
    const totalArticulos = data.reduce((acc, current) => acc + (Number(current.Cantidad) || 0), 0);
    const totalDescuentos = data.reduce((acc, current) => acc + (Number(current.Descuento) || 0), 0);

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="glass-panel shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-200/50 backdrop-blur-2xl bg-white/95 rounded-2xl">

                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-200/40 bg-gradient-to-r from-slate-50/40 to-transparent">
                    <div>
                        <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2.5">
                            <div className="p-2 bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 rounded-xl">
                                <Receipt size={18} strokeWidth={2.2} />
                            </div>
                            <span className="uppercase tracking-wider">Desglose del Ticket</span>
                        </h2>
                        <div className="flex items-center gap-3 mt-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
                            <p>Folio: <span className="text-slate-600 font-extrabold">{folioVenta}</span></p>
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                            <p>Cliente: <span className="text-slate-600 font-extrabold">{clienteName || 'Venta de Mostrador'}</span></p>
                        </div>
                    </div>
                    <div>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/20 border border-transparent rounded-xl transition-all cursor-pointer"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto p-0 bg-transparent">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                            <Loader2 className="animate-spin mb-4 text-indigo-500" size={28} />
                            <p className="text-xs font-bold uppercase tracking-wider">Cargando desglose...</p>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-48 text-red-500">
                            <p className="font-bold uppercase tracking-wider">Error de consulta</p>
                            <p className="text-xs font-semibold opacity-80 mt-1 text-center max-w-sm">{error}</p>
                        </div>
                    ) : data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                            <p className="font-bold uppercase tracking-wider text-slate-400">El ticket apareció vacío</p>
                            <p className="text-xs font-semibold mt-1">No se hallaron productos registrados para esta venta.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm border-collapse">
                            <thead className="bg-slate-50/50 sticky top-0 shadow-sm z-10 backdrop-blur-md border-b border-slate-200/50">
                                <tr>
                                    <th className="px-5 py-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider w-20 text-center">Cant.</th>
                                    <th className="px-5 py-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Descripción</th>
                                    <th className="px-5 py-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider text-right w-32">Precio</th>
                                    <th className="px-5 py-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider text-right w-32">Descuento</th>
                                    <th className="px-5 py-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider text-right w-32">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100/60 bg-transparent table-fixed">
                                {data.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-indigo-500/5 transition-all duration-200">
                                        <td className="px-5 py-3 text-xs font-bold text-slate-700 text-center">{row.Cantidad}</td>
                                        <td className="px-5 py-3 text-xs font-semibold text-slate-600 whitespace-normal break-words">{row.Descripcion}</td>
                                        <td className="px-5 py-3 text-xs font-semibold text-slate-600 text-right">{formatCurrency(row.Precio)}</td>
                                        <td className="px-5 py-3 text-xs font-semibold text-slate-400 text-right">{formatCurrency(row.Descuento)}</td>
                                        <td className="px-5 py-3 text-xs font-bold text-slate-800 text-right">{formatCurrency(row.Total)}</td>
                                    </tr>
                                ))}
                                {/* Fila Totalizadora Estática */}
                                <tr className="bg-slate-50/40 border-t border-slate-200/50 font-bold text-slate-800">
                                    <td className="px-5 py-4 text-center text-xs font-extrabold text-slate-700">{totalArticulos}</td>
                                    <td className="px-5 py-4 text-xs font-extrabold uppercase tracking-wider text-right text-slate-400" colSpan={2}>Totales:</td>
                                    <td className="px-5 py-4 text-right text-xs font-bold text-red-500">{totalDescuentos > 0 ? formatCurrency(totalDescuentos) : '-'}</td>
                                    <td className="px-5 py-4 text-right text-sm font-extrabold text-indigo-600">{formatCurrency(totalTicket)}</td>
                                </tr>
                            </tbody>
                        </table>
                    )}
                </div>

            </div>
        </div>
    );
}
