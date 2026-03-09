'use client';

import { useState, useRef, useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
    AreaChart,
    Area,
} from 'recharts';
import { Table, FileCode, BarChart3, Download, FileText, Receipt, X, ArrowUpDown, ArrowUp, ArrowDown, Search, Maximize2 } from 'lucide-react';
import { utils, writeFile } from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { cn } from '@/lib/utils';

interface ResultsDisplayProps {
    data: Record<string, any>[];
    sql: string;
    question: string;
    visualization: 'table' | 'bar' | 'line' | 'pie' | 'area';
    onVisualizationChange?: (viz: 'table' | 'bar' | 'line' | 'pie' | 'area') => void;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export function ResultsDisplay({ data, sql, question, visualization: initialViz, onVisualizationChange }: ResultsDisplayProps) {
    const [view, setView] = useState<'table' | 'chart' | 'sql'>(
        (initialViz === 'table' || data.length > 50) ? 'table' : 'chart'
    );
    const [chartType, setChartType] = useState<'bar' | 'line' | 'pie' | 'area'>(
        (initialViz === 'table' || initialViz === undefined) ? 'bar' : initialViz as any
    );
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [filters, setFilters] = useState<Record<string, string>>({});
    const [isMaximized, setIsMaximized] = useState(false);
    const chartRef = useRef<HTMLDivElement>(null);

    useMemo(() => {
        if (initialViz !== 'table' && initialViz !== undefined && data.length <= 50) {
            setView('chart');
            setChartType(initialViz as any);
        } else if (data.length > 50) {
            setView('table');
        }
    }, [initialViz, data.length]);

    const handleViewChange = (newView: 'table' | 'chart' | 'sql') => {
        setView(newView);
        if (onVisualizationChange) {
            onVisualizationChange(newView === 'chart' ? chartType : 'table');
        }
    };

    const handleChartTypeChange = (newType: 'bar' | 'line' | 'pie' | 'area') => {
        setChartType(newType);
        if (onVisualizationChange && view === 'chart') {
            onVisualizationChange(newType);
        }
    };

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const sortedAndFilteredData = useMemo(() => {
        if (!data) return [];
        let processedData = [...data];

        Object.keys(filters).forEach(key => {
            const filterValue = filters[key].toLowerCase();
            if (filterValue) {
                processedData = processedData.filter(row =>
                    String(row[key] || '').toLowerCase().includes(filterValue)
                );
            }
        });

        if (sortConfig) {
            processedData.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];
                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return processedData;
    }, [data, filters, sortConfig]);

    const hasData = data && data.length > 0;
    const keys = hasData ? Object.keys(data[0]) : [];
    const xKey = keys[0];
    const dataKeys = keys.slice(1);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const renderChart = () => {
        const CommonProps = {
            data,
            margin: { top: 20, right: 30, left: 20, bottom: 60 },
        };

        return (
            <div className="w-full h-full bg-white/50 backdrop-blur-sm rounded-xl p-4 border border-slate-200 shadow-inner">
                <ResponsiveContainer width="100%" height="100%">
                    {(() => {
                        switch (chartType) {
                            case 'line':
                                return (
                                    <LineChart {...CommonProps}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                        <XAxis
                                            dataKey={xKey}
                                            stroke="#64748b"
                                            fontSize={11}
                                            tickLine={false}
                                            axisLine={false}
                                            interval={0}
                                            height={100}
                                            tick={(props: any) => {
                                                const { x, y, payload } = props;
                                                return (
                                                    <g transform={`translate(${x},${y})`}>
                                                        <text x={0} y={0} dy={16} textAnchor="end" fill="#64748b" fontSize={11} transform="rotate(-45)">
                                                            {payload.value}
                                                        </text>
                                                    </g>
                                                );
                                            }}
                                        />
                                        <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => typeof v === 'number' ? new Intl.NumberFormat('es-MX', { notation: 'compact' }).format(v) : v} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                            itemStyle={{ fontWeight: 'bold' }}
                                        />
                                        <Legend verticalAlign="top" height={36} />
                                        {dataKeys.map((key, index) => (
                                            <Line key={key} type="monotone" dataKey={key} stroke={COLORS[index % COLORS.length]} strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: 'white' }} activeDot={{ r: 6 }} />
                                        ))}
                                    </LineChart>
                                );
                            case 'pie':
                                return (
                                    <PieChart>
                                        <Pie
                                            data={data}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                                            outerRadius="80%"
                                            innerRadius="50%"
                                            paddingAngle={5}
                                            dataKey={dataKeys[0]}
                                            nameKey={xKey}
                                        >
                                            {data.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                    </PieChart>
                                );
                            case 'area':
                                return (
                                    <AreaChart {...CommonProps}>
                                        <defs>
                                            {COLORS.map((color, i) => (
                                                <linearGradient key={`grad-${i}`} id={`color${i}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                                                </linearGradient>
                                            ))}
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                        <XAxis
                                            dataKey={xKey}
                                            stroke="#64748b"
                                            fontSize={11}
                                            interval={0}
                                            height={100}
                                            tick={(props: any) => {
                                                const { x, y, payload } = props;
                                                return (
                                                    <g transform={`translate(${x},${y})`}>
                                                        <text x={0} y={0} dy={16} textAnchor="end" fill="#64748b" fontSize={11} transform="rotate(-45)">
                                                            {payload.value}
                                                        </text>
                                                    </g>
                                                );
                                            }}
                                        />
                                        <YAxis stroke="#64748b" fontSize={11} />
                                        <Tooltip />
                                        <Legend verticalAlign="top" />
                                        {dataKeys.map((key, index) => (
                                            <Area key={key} type="monotone" dataKey={key} stackId="1" stroke={COLORS[index % COLORS.length]} fill={`url(#color${index})`} strokeWidth={2} />
                                        ))}
                                    </AreaChart>
                                );
                            case 'bar':
                            default:
                                return (
                                    <BarChart {...CommonProps} barCategoryGap="15%">
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                        <XAxis
                                            dataKey={xKey}
                                            stroke="#64748b"
                                            fontSize={11}
                                            axisLine={false}
                                            tickLine={false}
                                            interval={0}
                                            height={100}
                                            tick={(props: any) => {
                                                const { x, y, payload } = props;
                                                return (
                                                    <g transform={`translate(${x},${y})`}>
                                                        <text x={0} y={0} dy={16} textAnchor="end" fill="#64748b" fontSize={11} transform="rotate(-45)">
                                                            {payload.value}
                                                        </text>
                                                    </g>
                                                );
                                            }}
                                        />
                                        <YAxis stroke="#64748b" fontSize={11} axisLine={false} tickLine={false} />
                                        <Tooltip cursor={{ fill: '#f8fafc' }} />
                                        <Legend verticalAlign="top" />
                                        {dataKeys.map((key, index) => (
                                            <Bar key={key} dataKey={key} fill={COLORS[index % COLORS.length]} radius={[6, 6, 0, 0]} />
                                        ))}
                                    </BarChart>
                                );
                        }
                    })()}
                </ResponsiveContainer>
            </div>
        );
    };

    const formatValue = (key: string, value: any) => {
        if (value === null || value === undefined) return '';
        if (typeof value === 'number') {
            const isCurrency = /Total|Costo|Monto|Venta|Precio|Promedio|Descuento|Importe/i.test(key);
            const isNotCurrency = /Id|Folio|Caja|Z|Año|Mes|Dia|Cantidad|Unidades|Tickets|Clientes|Articulos|Recuento|Conteo/i.test(key);
            if (isCurrency && !isNotCurrency) {
                return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
            }
            if (value % 1 !== 0) return value.toFixed(2);
        }
        return String(value);
    };

    const handleExportExcel = () => {
        const ws = utils.json_to_sheet(data);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Análisis");
        writeFile(wb, "analisis_nexus.xlsx");
    };

    const handleExportPDF = async () => {
        const doc = new jsPDF();
        if (view === 'chart' && chartRef.current) {
            try {
                const canvas = await html2canvas(chartRef.current);
                const imgData = canvas.toDataURL('image/png');
                const imgProps = doc.getImageProperties(imgData);
                const pdfWidth = doc.internal.pageSize.getWidth();
                const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
                doc.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                doc.save("grafica_analisis.pdf");
            } catch (error) {
                console.error("Error exporting chart to PDF:", error);
            }
        } else {
            autoTable(doc, {
                head: [keys],
                body: data.map(row => keys.map(key => row[key])),
                theme: 'striped',
                headStyles: { fillColor: '#3B82F6', textColor: 255 },
            });
            doc.save("tabla_analisis.pdf");
        }
    };

    const renderTable = (isMaximized = false) => {
        if (!hasData) {
            return (
                <div className="flex flex-col items-center justify-center py-20 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                    <div className="p-4 bg-white rounded-full shadow-sm mb-4">
                        <Search className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-bold">Sin resultados</h3>
                    <p className="text-sm text-slate-500 text-center px-8">No hemos encontrado registros para los filtros aplicados.</p>
                </div>
            );
        }

        return (
            <div className={cn(
                "relative overflow-x-auto rounded-xl border border-slate-200 shadow-sm",
                data.length > 20 && "max-h-[600px] overflow-y-auto"
            )}>
                <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                        <tr>
                            {keys.map((key) => (
                                <th key={key} className="px-4 py-4 min-w-[150px] group transition-colors hover:bg-slate-100">
                                    <div className="flex flex-col space-y-2">
                                        <div className="flex items-center justify-between cursor-pointer" onClick={() => handleSort(key)}>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{key}</span>
                                            {sortConfig?.key === key ? (
                                                sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
                                            ) : (
                                                <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity" />
                                            )}
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="Filtrar..."
                                                className="w-full pl-2 pr-6 py-1 text-[11px] bg-white border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none shadow-sm"
                                                value={filters[key] || ''}
                                                onChange={(e) => handleFilterChange(key, e.target.value)}
                                            />
                                            {filters[key] && (
                                                <button onClick={() => handleFilterChange(key, '')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                                    <X className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                        {sortedAndFilteredData.map((row, i) => (
                            <tr key={i} className="hover:bg-blue-50/40 transition-colors group">
                                {keys.map((key) => (
                                    <td key={key} className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
                                        {formatValue(key, row[key])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="flex flex-col space-y-4">
            <div className="flex items-center justify-between bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex p-1 bg-slate-100 rounded-xl space-x-1">
                    <button
                        onClick={() => handleViewChange('table')}
                        className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", view === 'table' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:bg-white/50")}
                    >
                        <div className="flex items-center space-x-2">
                            <Table className="w-4 h-4" />
                            <span>Tabla</span>
                        </div>
                    </button>
                    {data.length <= 50 && (
                        <button
                            onClick={() => handleViewChange('chart')}
                            className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", view === 'chart' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:bg-white/50")}
                        >
                            <div className="flex items-center space-x-2">
                                <BarChart3 className="w-4 h-4" />
                                <span>Gráfica</span>
                            </div>
                        </button>
                    )}
                </div>

                <div className="flex items-center space-x-2 px-2">
                    {view === 'chart' && (
                        <div className="flex bg-slate-100 rounded-lg p-1 mr-4">
                            {['bar', 'line', 'pie', 'area'].map((t) => (
                                <button
                                    key={t}
                                    onClick={() => handleChartTypeChange(t as any)}
                                    className={cn("px-2 py-1 rounded-md text-[10px] uppercase font-black transition-all", chartType === t ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-600")}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    )}
                    <button onClick={handleExportExcel} className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-xl transition-colors" title="Descargar Excel">
                        <Download className="w-5 h-5" />
                    </button>
                    <button onClick={handleExportPDF} className="p-2 hover:bg-rose-50 text-rose-600 rounded-xl transition-colors" title="Descargar PDF">
                        <FileText className="w-5 h-5" />
                    </button>
                    <div className="w-px h-6 bg-slate-200 mx-1" />
                    <button onClick={() => setIsMaximized(true)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <Maximize2 className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
            </div>

            <div className="min-h-[300px] overflow-visible">
                {view === 'table' && renderTable()}
                {view === 'chart' && (
                    <div ref={chartRef} className="h-[550px] w-full animate-in fade-in zoom-in duration-300">
                        {renderChart()}
                    </div>
                )}
                {view === 'sql' && (
                    <div className="p-4 bg-slate-900 rounded-2xl border-l-4 border-blue-500 shadow-xl overflow-hidden group">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Consulta Generada</span>
                            <FileCode className="w-4 h-4 text-blue-400" />
                        </div>
                        <pre className="text-emerald-400 font-mono text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed">
                            {sql}
                        </pre>
                    </div>
                )}
            </div>

            {isMaximized && (
                <div className="fixed inset-0 z-[10000] bg-slate-950/40 backdrop-blur-xl flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300">
                    <div className="bg-white w-full h-full max-w-7xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col border border-white/20">
                        <div className="px-8 py-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                                <div className="p-1">
                                    <BarChart3 className="w-8 h-8 text-blue-500" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-800 tracking-tight leading-none">Análisis Detallado</h3>
                                    <p className="text-sm text-slate-500 mt-1 font-medium truncate max-w-md italic opacity-60">"{question}"</p>
                                </div>
                            </div>
                            <button onClick={() => setIsMaximized(false)} className="p-4 hover:bg-rose-50 hover:text-rose-600 rounded-2xl transition-all text-slate-400">
                                <X className="w-8 h-8" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-10 bg-gradient-to-br from-white to-slate-50/50">
                            {view === 'table' && renderTable(true)}
                            {view === 'chart' && (
                                <div className="h-[70vh]">
                                    {renderChart()}
                                </div>
                            )}
                        </div>
                        <div className="px-8 py-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                            <div className="flex items-center space-x-6">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Registros</span>
                                    <span className="text-lg font-black text-slate-900">{data.length}</span>
                                </div>
                                <div className="h-8 w-px bg-slate-200" />
                                <div className="flex space-x-2">
                                    <button onClick={handleExportExcel} className="flex items-center space-x-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors">
                                        <Download className="w-4 h-4" />
                                        <span>Excel</span>
                                    </button>
                                    <button onClick={handleExportPDF} className="flex items-center space-x-2 px-4 py-2 bg-rose-50 text-rose-700 rounded-xl text-xs font-bold hover:bg-rose-100 transition-colors">
                                        <FileText className="w-4 h-4" />
                                        <span>PDF</span>
                                    </button>
                                </div>
                            </div>
                            <div className="flex space-x-2">
                                <button onClick={() => setView('table')} className={cn("px-6 py-2.5 rounded-2xl text-xs font-black uppercase transition-all", view === 'table' ? "bg-slate-900 text-white shadow-xl" : "bg-white border border-slate-200 text-slate-600")}>Tabla de Datos</button>
                                <button onClick={() => setView('chart')} className={cn("px-6 py-2.5 rounded-2xl text-xs font-black uppercase transition-all", view === 'chart' ? "bg-slate-900 text-white shadow-xl" : "bg-white border border-slate-200 text-slate-600")}>Gráfica Dinámica</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
