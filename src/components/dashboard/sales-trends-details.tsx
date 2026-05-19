"use client";

import { TrendingUp, TrendingDown, Minus, Store } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BranchTrend {
    IdTienda: number;
    Tienda: string;
    CurrentTotal: number;
    PrevTotal: number;
    TrendPercentage: number;
}

interface SalesTrendsDetailsProps {
    data: BranchTrend[];
}

export function SalesTrendsDetails({ data }: SalesTrendsDetailsProps) {
    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(val);
    };

    return (
        <div className="bg-white border border-slate-100 shadow-sm overflow-hidden rounded-2xl">
            <div className="px-6 py-4 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Store size={14} className="text-[#3B82F6]" />
                    Detalle por Sucursal y Tendencia
                </h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                            <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Sucursal</th>
                            <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Período Actual</th>
                            <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Período Anterior</th>
                            <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right w-32">Tendencia</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {data.map((item) => (
                            <tr key={item.IdTienda} className="hover:bg-slate-50 transition-colors group">
                                <td className="px-6 py-4">
                                    <span className="text-sm font-black text-slate-700 uppercase tracking-tight group-hover:text-[#3B82F6] transition-colors">
                                        {item.Tienda || 'Desconocida'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <span className="text-sm font-bold text-slate-900">
                                        {formatCurrency(item.CurrentTotal)}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <span className="text-sm font-medium text-slate-400">
                                        {formatCurrency(item.PrevTotal)}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className={cn(
                                        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-tight",
                                        item.TrendPercentage > 0 ? "bg-emerald-50 text-emerald-600" : 
                                        item.TrendPercentage < 0 ? "bg-rose-50 text-rose-600" : 
                                        "bg-slate-50 text-slate-400"
                                    )}>
                                        {item.TrendPercentage > 0 ? <TrendingUp size={12} /> : 
                                         item.TrendPercentage < 0 ? <TrendingDown size={12} /> : 
                                         <Minus size={12} />}
                                        {Math.abs(item.TrendPercentage).toFixed(1)}%
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
