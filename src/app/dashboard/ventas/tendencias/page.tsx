"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
    TrendingUp, TrendingDown, Calendar, Store, ArrowUpRight, 
    ArrowDownRight, RefreshCcw, LayoutGrid, 
    ShoppingCart, Ticket, DollarSign, Clock, CalendarDays, CalendarRange,
    CheckSquare, Square, Package, Layers, Info, X, FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SalesTrendsChart } from '@/components/dashboard/sales-trends-chart';
import { SalesTrendsDetails } from '@/components/dashboard/sales-trends-details';
import MultiSelect from '@/components/MultiSelect';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

const DEFAULT_COLORS = [
    '#3B82F6', // Blue
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#EC4899', // Pink
    '#8B5CF6', // Purple
    '#06B6D4', // Cyan
    '#F97316', // Orange
    '#EF4444', // Red
];

const getStoreColor = (name: string, index: number) => {
    if (!name) return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorIndex = Math.abs(hash) % DEFAULT_COLORS.length;
    return DEFAULT_COLORS[colorIndex];
};

export default function SalesTrendsPage() {
    const getFormattedDate = (offset = 0) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const today = getFormattedDate(0);
    const firstDayOfMonth = (() => {
        const d = new Date();
        d.setDate(1);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}-01`;
    })();

    const [fechaInicio, setFechaInicio] = useState(firstDayOfMonth);
    const [fechaFin, setFechaFin] = useState(today);
    const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
    const [groupBy, setGroupBy] = useState<'dia' | 'semana' | 'mes'>('dia');
    const [metric, setMetric] = useState<'venta' | 'operaciones' | 'ticket'>('venta');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [stores, setStores] = useState<any[]>([]);

    // Advanced Filters
    const [filterOptions, setFilterOptions] = useState<any>({ deptos: [], familias: [], articulos: [] });
    const [selectedDeptos, setSelectedDeptos] = useState<string[]>([]);
    const [selectedArticulos, setSelectedArticulos] = useState<string[]>([]);

    const chartRef = useRef<HTMLDivElement>(null);
    const [exporting, setExporting] = useState(false);

    // Fetch filters list on mount
    useEffect(() => {
        fetch('/api/dashboard/trends/filters')
            .then(res => res.json())
            .then(json => {
                if (json.success) {
                    setFilterOptions({
                        deptos: json.deptos || [],
                        articulos: json.articulos || []
                    });
                }
            })
            .catch(err => console.error('Error fetching filters:', err));
        
        // Fetch sucursales list directly
        fetch('/api/sucursales')
            .then(res => res.json())
            .then(json => {
                if (json.success && json.data) {
                    setStores(json.data.map((s: any) => ({ IdTienda: s.id, Tienda: s.name })));
                }
            })
            .catch(err => console.error('Error fetching sucursales:', err));
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const idTiendaParam = selectedStoreIds.length > 0 ? selectedStoreIds.join(',') : 'all';
            let url = `/api/dashboard/sales/trends?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}&idTienda=${idTiendaParam}&groupBy=${groupBy}`;
            if (selectedDeptos.length > 0) url += `&idDepto=${encodeURIComponent(selectedDeptos.join(','))}`;
            if (selectedArticulos.length > 0) url += `&codigoInterno=${selectedArticulos.join(',')}`;

            const res = await fetch(url);
            const json = await res.json();
            if (json.success) {
                setData(json);
            }
        } catch (error) {
            console.error('Error fetching trends:', error);
        } finally {
            setLoading(false);
        }
    }, [fechaInicio, fechaFin, selectedStoreIds, groupBy, selectedDeptos, selectedArticulos]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleExportPDF = async () => {
        if (!data) return;
        
        setExporting(true);
        try {
            const doc = new jsPDF();
            
            // Title & Header Info
            doc.setFontSize(20);
            doc.setTextColor(30, 41, 59); // Slate 800
            doc.text('Reporte de Tendencias de Ventas', 14, 20);
            
            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139); // Slate 500
            doc.text(`Periodo: ${fechaInicio} al ${fechaFin}`, 14, 28);
            doc.text(`Sucursales: ${currentStoreTitle}`, 14, 33);
            
            let filterDetails = '';
            if (selectedDeptos.length > 0) {
                filterDetails += `Deptos: ${selectedDeptos.join(', ')}  `;
            }
            if (selectedArticulos.length > 0) {
                filterDetails += `Articulos: ${selectedArticulos.length} seleccionados`;
            }
            if (filterDetails) {
                doc.text(`Filtros aplicados: ${filterDetails}`, 14, 38);
            }
            doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, filterDetails ? 43 : 38);
            
            // Add KPI Summaries
            doc.setFontSize(14);
            doc.setTextColor(30, 41, 59);
            const yStartKPI = filterDetails ? 53 : 48;
            doc.text('Resumen de Rendimiento', 14, yStartKPI);
            
            const kpiHeaders = [["Metrica", "Valor Acumulado", "Metrica de Soporte", "Valor Soporte"]];
            const kpiRows = [
                ["Venta Total", formatCurrency(totalSales), "Ticket Promedio", formatCurrency(ticketPromedio)],
                ["Operaciones Totales", new Intl.NumberFormat('es-MX').format(totalOps), "Variacion del Periodo", `${globalTrend >= 0 ? '+' : ''}${globalTrend.toFixed(1)}%`]
            ];
            
            autoTable(doc, {
                head: kpiHeaders,
                body: kpiRows,
                startY: yStartKPI + 4,
                theme: 'grid',
                headStyles: { fillColor: [30, 41, 59] },
                styles: { fontSize: 9, cellPadding: 4 }
            });

            // Try capturing the chart using html2canvas
            let chartImgData = null;
            let pdfWidth = 182;
            let pdfHeight = 85;
            
            if (chartRef.current) {
                try {
                    const canvas = await html2canvas(chartRef.current, {
                        scale: 2, // High-quality display resolution
                        useCORS: true,
                        backgroundColor: '#ffffff',
                        logging: false
                    });
                    chartImgData = canvas.toDataURL('image/png');
                    const imgProps = doc.getImageProperties(chartImgData);
                    pdfWidth = doc.internal.pageSize.getWidth() - 28; // 14 margin on each side
                    pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
                } catch (error) {
                    console.error("Error capturing chart with html2canvas:", error);
                }
            }

            // Table 1: Branch Performance Table OR Chart first!
            let yStartBranch = (doc as any).lastAutoTable.finalY + 12;
            
            if (chartImgData) {
                // If it goes off page 1, add page
                if (yStartBranch > 180) {
                    doc.addPage();
                    yStartBranch = 20;
                }
                
                doc.setFontSize(14);
                doc.setTextColor(30, 41, 59);
                doc.text('Gráfica de Tendencia de Ventas', 14, yStartBranch);
                
                doc.addImage(chartImgData, 'PNG', 14, yStartBranch + 4, pdfWidth, pdfHeight);
                yStartBranch = yStartBranch + 4 + pdfHeight + 12;
            }
            
            // If the branch table goes too low, add page
            if (yStartBranch > 220) {
                doc.addPage();
                yStartBranch = 20;
            }
            
            doc.setFontSize(14);
            doc.setTextColor(30, 41, 59);
            doc.text('Desglose de Ventas y Tendencia por Sucursal', 14, yStartBranch);
            
            const branchHeaders = [["Sucursal", "Total Periodo Actual", "Total Periodo Anterior", "Variacion (%)"]];
            const branchRows = (data.branchTrends || []).map((item: any) => [
                item.Tienda || 'Desconocida',
                formatCurrency(item.CurrentTotal),
                formatCurrency(item.PrevTotal),
                `${item.TrendPercentage >= 0 ? '+' : ''}${item.TrendPercentage.toFixed(1)}%`
            ]);
            
            autoTable(doc, {
                head: branchHeaders,
                body: branchRows,
                startY: yStartBranch + 4,
                theme: 'grid',
                headStyles: { fillColor: [37, 99, 235] },
                styles: { fontSize: 9, cellPadding: 4 },
                columnStyles: {
                    1: { halign: 'right' },
                    2: { halign: 'right' },
                    3: { halign: 'right' }
                }
            });
            
            // Table 2: Time Series Table
            const yStartTimeSeries = (doc as any).lastAutoTable.finalY + 12;
            
            // If we run out of vertical space on the current page, add a new page
            let finalYPosition = yStartTimeSeries;
            if (finalYPosition > 200) {
                doc.addPage();
                finalYPosition = 20;
            }
            
            doc.setFontSize(14);
            doc.setTextColor(30, 41, 59);
            doc.text(`Historico Detallado de Ventas (Agrupado por ${groupBy === 'dia' ? 'Dia' : groupBy === 'semana' ? 'Semana' : 'Mes'})`, 14, finalYPosition);
            
            const timeSeriesHeaders = groupBy === 'dia' 
                ? [["Fecha", "Venta Total", "Tickets (Ops)", "Ticket Promedio"]]
                : [["Periodo (Inicio)", "Venta Total", "Tickets (Ops)", "Ticket Promedio"]];
                
            // Aggregate by date to show a clean summary in the PDF table
            const aggregatedSeriesMap = new Map<string, { date: string, total: number, ops: number }>();
            (data.timeSeries || []).forEach((item: any) => {
                const dateStr = new Date(item.Fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
                if (!aggregatedSeriesMap.has(dateStr)) {
                    aggregatedSeriesMap.set(dateStr, { date: dateStr, total: 0, ops: 0 });
                }
                const entry = aggregatedSeriesMap.get(dateStr)!;
                entry.total += item.Total;
                entry.ops += item.Operaciones;
            });
            
            const timeSeriesRows = Array.from(aggregatedSeriesMap.values()).map(row => [
                row.date,
                formatCurrency(row.total),
                new Intl.NumberFormat('es-MX').format(row.ops),
                formatCurrency(row.ops > 0 ? row.total / row.ops : 0)
            ]);
            
            autoTable(doc, {
                head: timeSeriesHeaders,
                body: timeSeriesRows,
                startY: finalYPosition + 4,
                theme: 'striped',
                headStyles: { fillColor: [79, 70, 229] },
                styles: { fontSize: 9, cellPadding: 3.5 },
                columnStyles: {
                    1: { halign: 'right' },
                    2: { halign: 'right' },
                    3: { halign: 'right' }
                }
            });
            
            // Save PDF file
            doc.save(`Reporte_Tendencias_${fechaInicio}_a_${fechaFin}.pdf`);
        } catch (err) {
            console.error("Error exporting PDF:", err);
        } finally {
            setExporting(false);
        }
    };

    const handleStoreToggle = (id: string) => {
        setSelectedStoreIds(prev => {
            if (prev.includes(id)) {
                return prev.filter(i => i !== id);
            } else {
                return [...prev, id];
            }
        });
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(val);
    };

    const getMonthOffsetDate = (monthOffset: number) => {
        const d = new Date();
        d.setMonth(d.getMonth() + monthOffset);
        d.setDate(1);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}-01`;
    };

    const periods = [
        { label: 'Mes', start: firstDayOfMonth, end: today },
        { label: '3 Meses', start: getMonthOffsetDate(-3), end: today },
        { label: '6 Meses', start: getMonthOffsetDate(-6), end: today },
        { label: '1 Año', start: getMonthOffsetDate(-12), end: today },
    ];

    const currentStoreTitle = useMemo(() => {
        if (selectedStoreIds.length === 0) return 'Todas las sucursales';
        if (selectedStoreIds.length === 1) {
            return stores.find(s => s.IdTienda.toString() === selectedStoreIds[0])?.Tienda || 'Sucursal';
        }
        return `${selectedStoreIds.length} sucursales seleccionadas`;
    }, [selectedStoreIds, stores]);

    const filterTitle = useMemo(() => {
        const parts = [];
        if (selectedDeptos.length > 0) {
            parts.push(selectedDeptos.length > 2 ? `${selectedDeptos.length} DEPTOS` : selectedDeptos.join(', '));
        }
        if (selectedArticulos.length > 0) {
            parts.push(selectedArticulos.length > 2 ? `${selectedArticulos.length} ARTÍCULOS` : `${selectedArticulos.length} Art.` );
        }
        return parts.length > 0 ? ` / ${parts.join(' - ')}` : '';
    }, [selectedDeptos, selectedArticulos]);

    const storeColor = useMemo(() => {
        if (selectedStoreIds.length === 1) {
            const name = stores.find(s => s.IdTienda.toString() === selectedStoreIds[0])?.Tienda;
            return name ? getStoreColor(name, 0) : '#3B82F6';
        }
        return '#3B82F6';
    }, [selectedStoreIds, stores]);

    const totalSales = data?.timeSeries?.reduce((acc: number, curr: any) => acc + curr.Total, 0) || 0;
    const totalOps = data?.timeSeries?.reduce((acc: number, curr: any) => acc + curr.Operaciones, 0) || 0;
    const ticketPromedio = totalOps > 0 ? totalSales / totalOps : 0;
    
    const currentTotal = data?.branchTrends?.reduce((acc: number, curr: any) => acc + curr.CurrentTotal, 0) || 0;
    const prevTotal = data?.branchTrends?.reduce((acc: number, curr: any) => acc + curr.PrevTotal, 0) || 0;
    const globalTrend = prevTotal > 0 ? ((currentTotal - prevTotal) / prevTotal) * 100 : 0;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header with Filters & Periods */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white py-4 px-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3">
                        <TrendingUp style={{ color: storeColor }} className="transition-all duration-300" />
                        Tendencias de Ventas
                    </h1>

                    <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-xl p-1 overflow-x-auto no-scrollbar">
                        {periods.map(({ label, start, end }) => {
                            const isActive = fechaInicio === start && fechaFin === end;
                            return (
                                <button
                                    key={label}
                                    onClick={() => { setFechaInicio(start); setFechaFin(end); }}
                                    className={cn(
                                        'px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap',
                                        isActive ? 'bg-blue-600 text-white shadow-sm font-black' : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                                    )}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                        <Calendar size={16} className="text-blue-500" />
                        <input
                            type="date"
                            value={fechaInicio}
                            onChange={(e) => setFechaInicio(e.target.value)}
                            className="bg-transparent text-xs font-bold text-slate-700 outline-none p-0 border-none h-auto w-28"
                        />
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                        <Calendar size={16} className="text-blue-500" />
                        <input
                            type="date"
                            value={fechaFin}
                            onChange={(e) => setFechaFin(e.target.value)}
                            className="bg-transparent text-xs font-bold text-slate-700 outline-none p-0 border-none h-auto w-28"
                        />
                    </div>
                    <button
                        onClick={handleExportPDF}
                        className="flex items-center gap-2 px-3 py-2.5 bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 hover:border-rose-300 transition-all rounded-xl shadow-sm text-xs font-bold cursor-pointer disabled:opacity-50"
                        disabled={loading || !data || exporting}
                        title="Exportar Reporte a PDF"
                    >
                        {exporting ? (
                            <RefreshCcw size={16} className="animate-spin" />
                        ) : (
                            <FileText size={16} />
                        )}
                        <span className="hidden sm:inline">{exporting ? 'Exportando...' : 'Exportar PDF'}</span>
                    </button>
                    <button
                        onClick={fetchData}
                        className="p-2.5 bg-slate-50 border border-slate-200 text-blue-600 hover:bg-slate-100 hover:border-slate-300 transition-all rounded-xl shadow-sm cursor-pointer"
                        disabled={loading}
                    >
                        <RefreshCcw size={16} className={cn(loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Advanced Filters Bar */}
            <div className="bg-slate-900 py-3.5 px-6 rounded-2xl shadow-lg border border-slate-800 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="w-52">
                        <MultiSelect 
                            options={filterOptions.deptos.map((d: any) => ({ id: d.Depto, name: d.Depto }))}
                            selected={selectedDeptos}
                            onChange={setSelectedDeptos}
                            placeholder="DEPARTAMENTOS"
                            searchable={true}
                        />
                    </div>

                    <div className="flex-1 min-w-[280px] max-w-[500px]">
                        <MultiSelect 
                            options={filterOptions.articulos.map((a: any) => ({ 
                                id: a.IdArticulo, 
                                name: `${a.Descripcion}${a.Codigo ? ` [${a.Codigo}]` : ''}${a.CodigoBarras ? ` (${a.CodigoBarras})` : ''}`
                            }))}
                            selected={selectedArticulos}
                            onChange={setSelectedArticulos}
                            placeholder="ARTÍCULOS"
                            searchable={true}
                        />
                    </div>

                    {(selectedDeptos.length > 0 || selectedArticulos.length > 0) && (
                        <button 
                            onClick={() => {
                                setSelectedDeptos([]);
                                setSelectedArticulos([]);
                            }}
                            className="text-[10px] font-black text-rose-400 uppercase tracking-widest hover:text-rose-300 transition-colors ml-auto flex items-center gap-1.5"
                        >
                            Limpiar Filtros
                        </button>
                    )}
                </div>

                {/* Selected Badges Row */}
                {(selectedDeptos.length > 0 || selectedArticulos.length > 0) && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5 animate-in fade-in duration-300">
                        {selectedDeptos.map(depto => (
                            <div 
                                key={depto}
                                className="inline-flex items-center gap-1 bg-white/10 text-white/90 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tight"
                            >
                                <span className="text-white/40 font-black mr-0.5">DEP:</span>
                                {depto}
                                <button 
                                    onClick={() => setSelectedDeptos(prev => prev.filter(d => d !== depto))}
                                    className="hover:text-rose-400 transition-colors ml-1 text-white/50"
                                >
                                    <X size={10} />
                                </button>
                            </div>
                        ))}
                        {selectedArticulos.map(artId => {
                            const art = filterOptions.articulos.find((a: any) => a.IdArticulo.toString() === artId);
                            const name = art 
                                ? `${art.Descripcion}${art.Codigo ? ` [${art.Codigo}]` : ''}` 
                                : `Art. ${artId}`;
                            return (
                                <div 
                                    key={artId}
                                    className="inline-flex items-center gap-1 bg-blue-500/20 text-blue-200 border border-blue-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tight"
                                >
                                    <span className="text-blue-300/60 font-black mr-0.5">ART:</span>
                                    {name}
                                    <button 
                                        onClick={() => setSelectedArticulos(prev => prev.filter(id => id !== artId))}
                                        className="hover:text-rose-400 transition-colors ml-1 text-blue-300/70"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* KPI: Sales */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md hover:border-blue-100 transition-all duration-300">
                    <div className="absolute top-0 right-0 p-3 opacity-[0.03] group-hover:scale-110 transition-transform duration-300">
                        <DollarSign size={80} style={{ color: storeColor }} />
                    </div>
                    <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Venta Total</span>
                        <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">{formatCurrency(totalSales)}</h2>
                    </div>
                    <div className="flex justify-between items-center text-xs font-bold border-t border-slate-50 pt-4 mt-2">
                        <span className="text-slate-500">Ticket Promedio</span>
                        <span style={{ color: storeColor }}>{formatCurrency(ticketPromedio)}</span>
                    </div>
                </div>

                {/* KPI: Operations */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md hover:border-emerald-100 transition-all duration-300">
                    <div className="absolute top-0 right-0 p-3 opacity-[0.03] group-hover:scale-110 transition-transform duration-300">
                        <ShoppingCart size={80} className="text-emerald-500" />
                    </div>
                    <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Operaciones</span>
                        <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">{new Intl.NumberFormat('es-MX').format(totalOps)}</h2>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-50 p-2 rounded-xl mt-4">
                        <ArrowUpRight size={14} className="text-emerald-500 animate-pulse" />
                        <span>Flujo de tickets</span>
                    </div>
                </div>

                {/* KPI: Trend */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md hover:border-purple-100 transition-all duration-300">
                    <div className="absolute top-0 right-0 p-3 opacity-[0.03] group-hover:scale-110 transition-transform duration-300">
                        {globalTrend > 0 ? <TrendingUp size={80} className="text-blue-500" /> : <TrendingDown size={80} className="text-rose-500" />}
                    </div>
                    <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Variación</span>
                        <h2 className={cn("text-3xl font-black mb-2 tracking-tight", globalTrend >= 0 ? "text-blue-600" : "text-rose-600")}>
                            {globalTrend >= 0 ? '+' : ''}{globalTrend.toFixed(1)}%
                        </h2>
                    </div>
                    <div className="flex justify-between items-center text-xs font-bold border-t border-slate-50 pt-4 mt-2">
                        <span className="text-slate-500">Vs. Periodo Anterior</span>
                        <span className={cn(globalTrend >= 0 ? "text-emerald-600" : "text-rose-600")}>
                            {formatCurrency(currentTotal - prevTotal)}
                        </span>
                    </div>
                </div>

                {/* KPI: Active stores count */}
                <div className="p-5 rounded-2xl shadow-xl shadow-blue-500/10 relative overflow-hidden group text-white hover:scale-[1.02] transition-transform duration-300" style={{ backgroundColor: storeColor }}>
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform duration-300">
                        <LayoutGrid size={80} className="text-white" />
                    </div>
                    <div>
                        <span className="text-[10px] font-black text-white/70 uppercase tracking-widest mb-1.5 block">Sucursales</span>
                        <h2 className="text-2xl font-black text-white mb-2 uppercase truncate pr-6 tracking-tight">{currentStoreTitle}</h2>
                    </div>
                    <div className="w-full bg-white/20 h-1.5 rounded-full mt-5 overflow-hidden">
                        <div className="bg-white h-full rounded-full transition-all duration-1000 w-[100%]" />
                    </div>
                </div>
            </div>

            {/* Sidebar + Chart Layout */}
            <div className="flex flex-col lg:flex-row gap-6">
                {/* Branch selector list card */}
                <div className="lg:w-72 shrink-0">
                    <div className="bg-white border border-slate-100 shadow-sm overflow-hidden flex flex-col h-[520px] rounded-2xl">
                        <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                             <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <Store size={14} />
                                Seleccionar Sucursales
                             </h2>
                             {selectedStoreIds.length > 0 && (
                                <button 
                                    onClick={() => setSelectedStoreIds([])}
                                    className="text-[10px] font-black text-blue-600 uppercase hover:underline"
                                >
                                    Limpiar
                                </button>
                             )}
                        </div>
                        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-1 bg-white">
                            <button
                                onClick={() => setSelectedStoreIds([])}
                                className={cn(
                                    "w-full flex items-center justify-between p-3.5 transition-all border-l-4 rounded-xl group mb-2",
                                    selectedStoreIds.length === 0 
                                        ? "bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/10"
                                        : "bg-white text-slate-600 border-transparent hover:bg-slate-50 hover:border-slate-200"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black transition-all",
                                        selectedStoreIds.length === 0 ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                                    )}>
                                        AZ
                                    </div>
                                    <span className="text-xs font-black tracking-tight uppercase">Todas las Sucursales</span>
                                </div>
                                {selectedStoreIds.length === 0 ? (
                                    <CheckSquare size={14} className="text-white" />
                                ) : (
                                    <Square size={14} className="text-slate-200 group-hover:text-slate-300" />
                                )}
                            </button>

                            {stores.map((store, i) => {
                                const isActive = selectedStoreIds.includes(store.IdTienda.toString());
                                const color = getStoreColor(store.Tienda, i);
                                return (
                                    <button
                                        key={store.IdTienda}
                                        onClick={() => handleStoreToggle(store.IdTienda.toString())}
                                        className={cn(
                                            "w-full flex items-center justify-between p-3.5 transition-all border-l-4 rounded-xl group",
                                            isActive 
                                                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-100 border-l-4"
                                                : "bg-white text-slate-600 border-transparent hover:bg-slate-50"
                                        )}
                                        style={{ borderLeftColor: isActive ? color : 'transparent' }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div 
                                                className={cn(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black text-white shadow-sm transition-opacity"
                                                )}
                                                style={{ backgroundColor: color, opacity: isActive ? 1 : 0.4 }}
                                            >
                                                {store.Tienda.substring(0, 2).toUpperCase()}
                                            </div>
                                            <span className={cn(
                                                "text-xs font-black tracking-tight uppercase",
                                                isActive ? "text-slate-900" : "text-slate-500 group-hover:text-slate-800"
                                            )}>{store.Tienda}</span>
                                        </div>
                                        {isActive ? (
                                            <CheckSquare size={14} style={{ color: color }} />
                                        ) : (
                                            <Square size={14} className="text-slate-200 group-hover:text-slate-300" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Main chart panel */}
                <div className="flex-1 min-w-0">
                    <div className="bg-white border border-slate-100 shadow-sm p-5 h-[520px] flex flex-col rounded-2xl">
                        <div className="mb-4 pb-4 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <h2 className="text-base font-black text-slate-800 uppercase tracking-tight flex items-center flex-wrap gap-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0 animate-ping" style={{ backgroundColor: storeColor }} />
                                Tendencia de Venta
                                <span className="text-slate-300 font-light mx-1">/</span>
                                <span style={{ color: storeColor }} className="transition-all duration-300">{currentStoreTitle}</span>
                                {filterTitle && (
                                    <span className="text-slate-400 font-bold text-[10px] normal-case bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                                        {filterTitle.substring(3)}
                                    </span>
                                )}
                            </h2>

                             {/* Metrics selector */}
                             <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-xl p-1 self-end md:self-auto overflow-x-auto no-scrollbar">
                                <button
                                    onClick={() => setMetric('venta')}
                                    className={cn(
                                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap',
                                        metric === 'venta' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                                    )}
                                    title="Por Venta"
                                >
                                    <DollarSign size={12} /> Venta
                                </button>
                                <button
                                    onClick={() => setMetric('operaciones')}
                                    className={cn(
                                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap',
                                        metric === 'operaciones' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                                    )}
                                    title="Por Operaciones"
                                >
                                    <ShoppingCart size={12} /> Ops
                                </button>
                                <button
                                    onClick={() => setMetric('ticket')}
                                    className={cn(
                                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap',
                                        metric === 'ticket' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                                    )}
                                    title="Por Ticket Promedio"
                                >
                                    <Ticket size={12} /> Ticket
                                </button>
                            </div>

                            {/* Grouping Toggle */}
                            <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-xl p-1 self-end md:self-auto">
                                <button
                                    onClick={() => setGroupBy('dia')}
                                    className={cn(
                                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                                        groupBy === 'dia' ? 'bg-white text-slate-900 shadow-sm font-black' : 'text-slate-500 hover:text-slate-800'
                                    )}
                                >
                                    <Clock size={12} /> Día
                                </button>
                                <button
                                    onClick={() => setGroupBy('semana')}
                                    className={cn(
                                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                                        groupBy === 'semana' ? 'bg-white text-slate-900 shadow-sm font-black' : 'text-slate-500 hover:text-slate-800'
                                    )}
                                >
                                    <CalendarDays size={12} /> Sem
                                </button>
                                <button
                                    onClick={() => setGroupBy('mes')}
                                    className={cn(
                                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                                        groupBy === 'mes' ? 'bg-white text-slate-900 shadow-sm font-black' : 'text-slate-500 hover:text-slate-800'
                                    )}
                                >
                                    <CalendarRange size={12} /> Mes
                                </button>
                            </div>
                        </div>

                        {/* Rendering Recharts SalesTrendsChart */}
                        <div ref={chartRef} className="flex-1 pt-2 relative bg-white rounded-xl">
                            {loading ? (
                                <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[1px] z-10">
                                    <div className="flex flex-col items-center gap-3">
                                        <RefreshCcw size={32} className="animate-spin text-blue-500" />
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando Tendencias...</span>
                                    </div>
                                </div>
                            ) : data?.timeSeries?.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
                                    <Info size={36} className="opacity-20 text-blue-500" />
                                    <p className="text-xs font-black uppercase tracking-widest">No se encontraron datos para este rango y filtros</p>
                                </div>
                            ) : (
                                <SalesTrendsChart 
                                    data={data?.timeSeries || []} 
                                    height={380} 
                                    color={storeColor} 
                                    groupBy={groupBy} 
                                    isMulti={selectedStoreIds.length > 1} 
                                    metric={metric}
                                />
                            )}
                        </div>
                     </div>
                </div>
            </div>

            {/* Sucursales performance Details Grid */}
            {!loading && data?.branchTrends && (
                <div className="animate-in fade-in duration-700">
                    <SalesTrendsDetails data={data.branchTrends} />
                </div>
            )}
        </div>
    );
}
