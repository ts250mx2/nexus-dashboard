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
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">

                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Receipt className="text-blue-600" size={22} />
                            Desglose del Ticket
                        </h2>
                        <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                            <p>Folio: <span className="font-semibold text-slate-700">{folioVenta}</span></p>
                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                            <p>Cliente: <span className="font-semibold text-slate-700">{clienteName || 'Venta de Mostrador'}</span></p>
                        </div>
                    </div>
                    <div>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                        >
                            <X size={22} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto p-0 bg-white">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                            <Loader2 className="animate-spin mb-4 text-blue-500" size={28} />
                            <p className="text-sm font-medium">Cargando desglose...</p>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-48 text-red-500">
                            <p className="font-medium text-sm">Error de consulta</p>
                            <p className="text-xs opacity-80 mt-1 text-center max-w-sm">{error}</p>
                        </div>
                    ) : data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                            <p className="font-medium text-sm">El ticket apareció vacío</p>
                            <p className="text-xs mt-1">No se hallaron productos registrados para esta venta.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm border-collapse">
                            <thead className="bg-slate-50 sticky top-0 shadow-sm z-10 border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3 font-semibold text-slate-600 uppercase tracking-wider w-20 text-center">Cant.</th>
                                    <th className="px-4 py-3 font-semibold text-slate-600 uppercase tracking-wider">Descripción</th>
                                    <th className="px-4 py-3 font-semibold text-slate-600 uppercase tracking-wider text-right w-32">Precio</th>
                                    <th className="px-4 py-3 font-semibold text-slate-600 uppercase tracking-wider text-right w-32">Descuento</th>
                                    <th className="px-4 py-3 font-semibold text-slate-600 uppercase tracking-wider text-right w-32">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 table-fixed">
                                {data.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-slate-700 text-center">{row.Cantidad}</td>
                                        <td className="px-4 py-3 text-slate-600 whitespace-normal break-words">{row.Descripcion}</td>
                                        <td className="px-4 py-3 text-slate-600 text-right">{formatCurrency(row.Precio)}</td>
                                        <td className="px-4 py-3 text-slate-500 text-right">{formatCurrency(row.Descuento)}</td>
                                        <td className="px-4 py-3 font-semibold text-slate-800 text-right">{formatCurrency(row.Total)}</td>
                                    </tr>
                                ))}
                                {/* Fila Totalizadora Estática */}
                                <tr className="bg-slate-50 border-t border-slate-200 font-bold text-slate-800">
                                    <td className="px-4 py-4 text-center text-slate-600">{totalArticulos}</td>
                                    <td className="px-4 py-4 uppercase text-right" colSpan={2}>Totales:</td>
                                    <td className="px-4 py-4 text-right text-red-500">{totalDescuentos > 0 ? formatCurrency(totalDescuentos) : '-'}</td>
                                    <td className="px-4 py-4 text-right text-blue-700 text-base">{formatCurrency(totalTicket)}</td>
                                </tr>
                            </tbody>
                        </table>
                    )}
                </div>

            </div>
        </div>
    );
}
