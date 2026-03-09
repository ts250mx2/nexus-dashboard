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
        { name: 'Ventas del día', value: formattedVentas, change: 'Hoy', icon: DollarSign, trend: 'stable', color: 'emerald' },
        { name: 'Operaciones del día', value: totalOperaciones.toString(), change: 'Hoy', icon: ShoppingBag, trend: 'stable', color: 'amber' },
        { name: 'Aperturas Activas', value: totalAperturas.toString(), change: 'En curso', icon: Store, trend: 'stable', color: 'blue' },
        { name: 'Ticket Promedio', value: formattedTicket, change: 'Hoy', icon: Receipt, trend: 'stable', color: 'purple' },
    ];

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Panel Principal</h1>
                </div>
                <div className="flex flex-wrap items-center gap-3 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100">
                    <DatePresets />
                    <div className="w-px h-6 bg-slate-100 mx-1 hidden sm:block"></div>
                    <div className="flex items-center gap-3">
                        <CalendarDays size={18} className="text-slate-400" />
                        <DateSelector defaultStartDate={startDate} defaultEndDate={endDate} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat) => (
                    <div key={stat.name} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 transition-all duration-200 hover:shadow-md hover:border-blue-100 group">
                        <div className="flex items-start justify-between">
                            <div className={cn(
                                "flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110",
                                stat.color === 'emerald' && "text-emerald-500",
                                stat.color === 'amber' && "text-amber-500",
                                stat.color === 'blue' && "text-blue-500",
                                stat.color === 'purple' && "text-purple-500"
                            )}>
                                <stat.icon size={32} strokeWidth={2.5} />
                            </div>
                        </div>
                        <div className="mt-4">
                            <p className="text-sm font-medium text-slate-500">{stat.name}</p>
                            <p className="text-3xl font-extrabold text-blue-600 mt-1">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                    <DashboardChart data={ventasSucursal} startDate={startDate} endDate={endDate} />
                </div>

                <VentasTable data={ventasSucursal} startDate={startDate} endDate={endDate} />
            </div>
        </div >
    );
}

function Option({ children }: { children: React.ReactNode }) {
    return <option className="bg-white text-slate-700">{children}</option>;
}

