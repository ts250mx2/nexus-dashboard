import {
    DollarSign,
    ShoppingBag,
    Store,
    Receipt,
    ArrowUpRight,
    ArrowDownRight,
    Clock,
    CalendarDays
} from 'lucide-react';
import { cn } from '@/lib/utils';
import React from 'react';
import { query } from '@/lib/db';
import DateSelector from './DateSelector';
import DashboardChart from './DashboardChart';
import VentasTable from './VentasTable';
import DatePresets from '@/components/DatePresets';

export const dynamic = 'force-dynamic';

function getTargetDate() {
    const now = new Date();
    if (now.getHours() < 7) {
        now.setDate(now.getDate() - 1);
    }

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function getVentasDelDia(startDate: string, endDate: string) {
    try {
        const rows = await query(
            `SELECT SUM(Total) as total FROM tblVentas WHERE Status = 0 AND DATE(FechaVenta) >= ? AND DATE(FechaVenta) <= ?`,
            [startDate, endDate]
        );
        return parseFloat(rows[0]?.total || 0);
    } catch (error) {
        console.error('Error fetching ventas del dia:', error);
        return 0;
    }
}

async function getOperacionesDelDia(startDate: string, endDate: string) {
    try {
        const rows = await query(
            `SELECT COUNT(Total) AS Operaciones FROM tblVentas WHERE Status = 0 AND DATE(FechaVenta) >= ? AND DATE(FechaVenta) <= ?`,
            [startDate, endDate]
        );
        return parseInt(rows[0]?.Operaciones || 0, 10);
    } catch (error) {
        console.error('Error fetching operaciones del dia:', error);
        return 0;
    }
}

async function getAperturasActivas(startDate: string, endDate: string) {
    try {
        const rows = await query(
            `SELECT COUNT(IdApertura) AS Aperturas FROM tblAperturasCierres WHERE DATE(FechaApertura) >= ? AND DATE(FechaApertura) <= ?`,
            [startDate, endDate]
        );
        return parseInt(rows[0]?.Aperturas || 0, 10);
    } catch (error) {
        console.error('Error fetching aperturas activas:', error);
        return 0;
    }
}

async function getTicketPromedio(startDate: string, endDate: string) {
    try {
        const rows = await query(
            `SELECT SUM(Total)/COUNT(IdVenta) AS TicketPromedio FROM tblVentas WHERE Status = 0 AND DATE(FechaVenta) >= ? AND DATE(FechaVenta) <= ?`,
            [startDate, endDate]
        );
        return parseFloat(rows[0]?.TicketPromedio || 0);
    } catch (error) {
        console.error('Error fetching ticket promedio:', error);
        return 0;
    }
}

async function getVentasPorSucursal(startDate: string, endDate: string) {
    try {
        const rows = await query(`
            SELECT 
                A.IdSucursal, 
                Sucursal, 
                SUM(Total) AS Total, 
                COUNT(IdVenta) AS Operaciones, 
                SUM(Total)/COUNT(IdVenta) AS TicketPromedio, 
                COUNT(DISTINCT IdApertura) AS Aperturas 
            FROM tblVentas A
            INNER JOIN tblSucursales B ON A.IdSucursal = B.IdSucursal
            WHERE A.Status = 0 AND DATE(FechaVenta) >= ? AND DATE(FechaVenta) <= ?
            GROUP BY A.IdSucursal, Sucursal
            ORDER BY A.IdSucursal
        `, [startDate, endDate]);

        return rows.map((row: any) => ({
            id: row.IdSucursal,
            sucursal: row.Sucursal || 'Desconocida',
            total: parseFloat(row.Total || 0),
            operaciones: parseInt(row.Operaciones || 0, 10),
            aperturas: parseInt(row.Aperturas || 0, 10),
            ticketPromedio: parseFloat(row.TicketPromedio || 0)
        }));
    } catch (error) {
        console.error('Error fetching ventas por sucursal:', error);
        return [];
    }
}


export default async function DashboardPage(props: { searchParams?: Promise<{ startDate?: string, endDate?: string }> }) {
    const searchParams = await props.searchParams;
    const defaultDate = getTargetDate();

    const startDate = searchParams?.startDate || defaultDate;
    const endDate = searchParams?.endDate || defaultDate;

    const [totalVentas, totalOperaciones, totalAperturas, ticketPromedio, ventasSucursal] = await Promise.all([
        getVentasDelDia(startDate, endDate),
        getOperacionesDelDia(startDate, endDate),
        getAperturasActivas(startDate, endDate),
        getTicketPromedio(startDate, endDate),
        getVentasPorSucursal(startDate, endDate)
    ]);

    const formattedVentas = new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
    }).format(totalVentas);

    const formattedTicket = new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
    }).format(ticketPromedio);

    const stats = [
        { 
            name: 'Ventas del día', 
            value: formattedVentas, 
            change: 'Hoy', 
            icon: DollarSign, 
            trend: 'stable', 
            color: 'emerald',
            iconBg: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
            glowColor: 'from-emerald-500/5 to-transparent',
            valueColor: 'text-emerald-600'
        },
        { 
            name: 'Operaciones del día', 
            value: totalOperaciones.toString(), 
            change: 'Hoy', 
            icon: ShoppingBag, 
            trend: 'stable', 
            color: 'amber',
            iconBg: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
            glowColor: 'from-amber-500/5 to-transparent',
            valueColor: 'text-amber-600'
        },
        { 
            name: 'Aperturas Activas', 
            value: totalAperturas.toString(), 
            change: 'En curso', 
            icon: Store, 
            trend: 'stable', 
            color: 'blue',
            iconBg: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
            glowColor: 'from-blue-500/5 to-transparent',
            valueColor: 'text-blue-600'
        },
        { 
            name: 'Ticket Promedio', 
            value: formattedTicket, 
            change: 'Hoy', 
            icon: Receipt, 
            trend: 'stable', 
            color: 'purple',
            iconBg: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
            glowColor: 'from-purple-500/5 to-transparent',
            valueColor: 'text-purple-600'
        },
    ];

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 bg-clip-text text-transparent">Panel Principal</h1>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">Resumen de Ventas y Rendimiento</p>
                </div>
                <div className="bg-white border border-slate-200/60 px-4 py-2 rounded-xl flex flex-wrap items-center gap-4 shadow-xs">
                    <DatePresets />
                    <div className="w-px h-6 bg-slate-200/80 mx-1 hidden md:block"></div>
                    <div className="flex items-center gap-3">
                        <CalendarDays size={18} className="text-slate-400 shrink-0" />
                        <DateSelector defaultStartDate={startDate} defaultEndDate={endDate} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat) => (
                    <div 
                        key={stat.name} 
                        className={cn(
                            "bg-white border border-slate-200/60 border-l-4 p-5 rounded-xl relative overflow-hidden group hover-premium cursor-pointer transition-all duration-300 shadow-xs",
                            stat.color === 'emerald' ? 'border-l-emerald-500' :
                            stat.color === 'amber' ? 'border-l-amber-500' :
                            stat.color === 'blue' ? 'border-l-blue-500' :
                            'border-l-purple-500'
                        )}
                    >
                        <div className="flex items-start justify-between relative z-10">
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{stat.name}</p>
                                <p className={cn("text-3xl font-extrabold tracking-tight mt-2", stat.valueColor)}>{stat.value}</p>
                            </div>
                            <div className={cn(
                                "flex items-center justify-center shrink-0 w-10 h-10 rounded-lg border transition-all duration-300 group-hover:scale-105",
                                stat.iconBg
                            )}>
                                <stat.icon size={18} strokeWidth={2} />
                            </div>
                        </div>
                        <div className="mt-4 flex items-center gap-1.5 relative z-10">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-indigo-500 transition-colors animate-pulse" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{stat.change}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                    <DashboardChart data={ventasSucursal} startDate={startDate} endDate={endDate} />
                </div>

                <div>
                    <VentasTable data={ventasSucursal} startDate={startDate} endDate={endDate} />
                </div>
            </div>
        </div>
    );
}

function Option({ children }: { children: React.ReactNode }) {
    return <option className="bg-white text-slate-700">{children}</option>;
}

