'use client';

import React, { useState } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend
} from 'recharts';
import { TrendingUp, BarChart3, PieChart as PieChartIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import VentasDetailModal from '@/components/VentasDetailModal';

interface SucursalData {
    id: number;
    sucursal: string;
    total: number;
    operaciones: number;
    aperturas: number;
    ticketPromedio: number;
}

interface DashboardChartProps {
    data: SucursalData[];
    startDate: string;
    endDate: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1'];

type MetricType = 'total' | 'operaciones' | 'ticketPromedio';

export default function DashboardChart({ data, startDate, endDate }: DashboardChartProps) {
    const [metric, setMetric] = useState<MetricType>('total');
    const [chartType, setChartType] = useState<'bar' | 'pie'>('bar');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSucursalId, setSelectedSucursalId] = useState<number>(0);
    const [selectedSucursalName, setSelectedSucursalName] = useState<string>('');

    const handleChartClick = (entry: SucursalData) => {
        if (!entry) return;
        setSelectedSucursalId(entry.id);
        setSelectedSucursalName(entry.sucursal);
        setIsModalOpen(true);
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
    };

    const formatValue = (value: number) => {
        if (metric === 'total' || metric === 'ticketPromedio') {
            return formatCurrency(value);
        }
        return value.toString();
    };

    const getMetricLabel = () => {
        if (metric === 'total') return 'Ventas ($)';
        if (metric === 'operaciones') return 'Operaciones';
        return 'Ticket Promedio ($)';
    };

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-slate-900 text-white p-3 rounded-lg shadow-lg text-sm border border-slate-700">
                    <p className="font-bold mb-1">{payload[0].payload.sucursal}</p>
                    <p className="text-blue-300">
                        {getMetricLabel()}: <span className="text-white font-semibold">{formatValue(payload[0].value)}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 mt-2 italic">Haz clic para ver detalles</p>
                </div>
            );
        }
        return null;
    };

    // Remove branches with 0 values for the pie chart to avoid visual clutter
    const displayData = chartType === 'pie' ? data.filter(d => d[metric] > 0) : data;

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full">
            <div className="p-6 border-b border-slate-50 bg-gradient-to-r from-blue-50/50 to-white">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="text-emerald-500" size={20} />
                        <h2 className="text-lg font-bold text-slate-900">Métricas por Sucursal</h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Metric Selector */}
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button
                                onClick={() => setMetric('total')}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-semibold rounded-md transition-all",
                                    metric === 'total' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                )}
                            >
                                Ventas
                            </button>
                            <button
                                onClick={() => setMetric('operaciones')}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-semibold rounded-md transition-all",
                                    metric === 'operaciones' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                )}
                            >
                                Operaciones
                            </button>
                            <button
                                onClick={() => setMetric('ticketPromedio')}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-semibold rounded-md transition-all",
                                    metric === 'ticketPromedio' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                )}
                            >
                                T. Promedio
                            </button>
                        </div>

                        <div className="w-px h-6 bg-slate-200 hidden sm:block"></div>

                        {/* Chart Type Toggle */}
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button
                                onClick={() => setChartType('bar')}
                                className={cn(
                                    "p-1.5 rounded-md transition-all",
                                    chartType === 'bar' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                )}
                                title="Gráfico de Barras"
                            >
                                <BarChart3 size={16} />
                            </button>
                            <button
                                onClick={() => setChartType('pie')}
                                className={cn(
                                    "p-1.5 rounded-md transition-all",
                                    chartType === 'pie' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                )}
                                title="Gráfico de Pastel"
                            >
                                <PieChartIcon size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-6 flex-1 flex items-center justify-center bg-slate-50/20 min-h-[500px]">
                {displayData.length === 0 ? (
                    <div className="text-slate-500 font-medium">No hay datos suficientes para mostrar en esta métrica.</div>
                ) : (
                    <ResponsiveContainer width="100%" height={450}>
                        {chartType === 'bar' ? (
                            <BarChart data={displayData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }} barCategoryGap="15%">
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis
                                    dataKey="sucursal"
                                    axisLine={false}
                                    tickLine={false}
                                    interval={0}
                                    height={100}
                                    tick={(props: any) => {
                                        const { x, y, payload } = props;
                                        return (
                                            <g transform={`translate(${x},${y})`}>
                                                <text
                                                    x={0}
                                                    y={0}
                                                    dy={16}
                                                    textAnchor="end"
                                                    fill="#64748b"
                                                    fontSize={11}
                                                    fontWeight={500}
                                                    transform="rotate(-45)"
                                                >
                                                    {payload.value}
                                                </text>
                                            </g>
                                        );
                                    }}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#64748b', fontSize: 12 }}
                                    tickFormatter={(value) => metric !== 'operaciones' ? `$${value}` : value}
                                    width={80}
                                />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9' }} />
                                <Bar
                                    dataKey={metric}
                                    fill="#3b82f6"
                                    radius={[6, 6, 0, 0]}
                                    animationDuration={1000}
                                    onClick={(data) => data && handleChartClick(data.payload)}
                                    className="cursor-pointer"
                                >
                                    {displayData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        ) : (
                            <PieChart>
                                <Pie
                                    data={displayData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={2}
                                    dataKey={metric}
                                    nameKey="sucursal"
                                    animationDuration={1000}
                                    labelLine={false}
                                    onClick={(data) => handleChartClick(data.payload)}
                                    className="cursor-pointer outline-none"
                                >
                                    {displayData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                                <Legend
                                    wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }}
                                    layout="horizontal"
                                    verticalAlign="bottom"
                                    align="center"
                                />
                            </PieChart>
                        )}
                    </ResponsiveContainer>
                )}
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
