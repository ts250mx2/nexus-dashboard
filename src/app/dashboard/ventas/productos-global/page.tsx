'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowRight,
    Calendar,
    FileText,
    LayoutGrid,
    Loader2,
    Store,
    Package,
    RefreshCcw,
    TrendingUp,
    X,
    Search,
    ChevronRight
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend
} from 'recharts';
import DatePresetsProfesores from '@/components/DatePresetsProfesores';
import VentasItemDetailModal from '@/components/VentasItemDetailModal';
import { cn } from '@/lib/utils';

interface Branch {
    IdSucursal: string | number;
    Nombre: string;
    TotalVenta: number;
    TotalProductos: number;
}

interface Articulo {
    IdArticulo: number;
    Codigo?: string | null;
    Articulo: string;
    Cantidad: number;
    Total: number;
    NumeroTickets: number;
    TicketPromedio: number;
}

interface VentaDetalle {
    IdVenta: number;
    IdSucursal: number;
    Folio: string;
    Fecha: string;
    Sucursal: string;
    CantidadArticulo: number;
    TotalArticulo: number;
    TotalVenta: number;
}

function getToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getFirstOfMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
}

function getPastDate(monthsAgo: number) {
    const now = new Date();
    now.setMonth(now.getMonth() - monthsAgo);
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const CARD_THEMES = [
    {
        bg: "bg-gradient-to-br from-blue-500/[0.03] to-indigo-500/[0.03] hover:from-blue-500/[0.08] hover:to-indigo-500/[0.08]",
        border: "border-slate-200/80 hover:border-blue-500/50",
        selectedBg: "bg-gradient-to-br from-blue-500/15 via-indigo-500/10 to-transparent border-blue-600 shadow-md shadow-blue-500/10",
        accentText: "text-blue-700",
        iconContainer: "bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-lg shadow-blue-500/20",
        arrowColor: "text-blue-500",
        pillBg: "bg-blue-50 text-blue-700 border border-blue-100",
        badgeGlow: "shadow-blue-500/30"
    },
    {
        bg: "bg-gradient-to-br from-purple-500/[0.03] to-fuchsia-500/[0.03] hover:from-purple-500/[0.08] hover:to-fuchsia-500/[0.08]",
        border: "border-slate-200/80 hover:border-purple-500/50",
        selectedBg: "bg-gradient-to-br from-purple-500/15 via-fuchsia-500/10 to-transparent border-purple-600 shadow-md shadow-purple-500/10",
        accentText: "text-purple-700",
        iconContainer: "bg-gradient-to-tr from-purple-600 to-fuchsia-500 text-white shadow-lg shadow-purple-500/20",
        arrowColor: "text-purple-500",
        pillBg: "bg-purple-50 text-purple-700 border border-purple-100",
        badgeGlow: "shadow-purple-500/30"
    },
    {
        bg: "bg-gradient-to-br from-emerald-500/[0.03] to-teal-500/[0.03] hover:from-emerald-500/[0.08] hover:to-teal-500/[0.08]",
        border: "border-slate-200/80 hover:border-emerald-500/50",
        selectedBg: "bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-transparent border-emerald-600 shadow-md shadow-emerald-500/10",
        accentText: "text-emerald-700",
        iconContainer: "bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-500/20",
        arrowColor: "text-emerald-500",
        pillBg: "bg-emerald-50 text-emerald-700 border border-emerald-100",
        badgeGlow: "shadow-emerald-500/30"
    },
    {
        bg: "bg-gradient-to-br from-amber-500/[0.03] to-orange-500/[0.03] hover:from-amber-500/[0.08] hover:to-orange-500/[0.08]",
        border: "border-slate-200/80 hover:border-amber-500/50",
        selectedBg: "bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-transparent border-amber-600 shadow-md shadow-amber-500/10",
        accentText: "text-amber-850",
        iconContainer: "bg-gradient-to-tr from-amber-600 to-orange-500 text-white shadow-lg shadow-amber-500/20",
        arrowColor: "text-amber-600",
        pillBg: "bg-amber-50 text-amber-700 border border-amber-100",
        badgeGlow: "shadow-amber-500/30"
    },
    {
        bg: "bg-gradient-to-br from-rose-500/[0.03] to-pink-500/[0.03] hover:from-rose-500/[0.08] hover:to-pink-500/[0.08]",
        border: "border-slate-200/80 hover:border-rose-500/50",
        selectedBg: "bg-gradient-to-br from-rose-500/15 via-pink-500/10 to-transparent border-rose-600 shadow-md shadow-rose-500/10",
        accentText: "text-rose-700",
        iconContainer: "bg-gradient-to-tr from-rose-600 to-pink-500 text-white shadow-lg shadow-rose-500/20",
        arrowColor: "text-rose-500",
        pillBg: "bg-rose-50 text-rose-700 border border-rose-100",
        badgeGlow: "shadow-rose-500/30"
    },
    {
        bg: "bg-gradient-to-br from-indigo-500/[0.03] to-blue-500/[0.03] hover:from-indigo-500/[0.08] hover:to-blue-500/[0.08]",
        border: "border-slate-200/80 hover:border-indigo-500/50",
        selectedBg: "bg-gradient-to-br from-indigo-500/15 via-blue-500/10 to-transparent border-indigo-600 shadow-md shadow-indigo-500/10",
        accentText: "text-indigo-700",
        iconContainer: "bg-gradient-to-tr from-indigo-600 to-blue-500 text-white shadow-lg shadow-indigo-500/20",
        arrowColor: "text-indigo-500",
        pillBg: "bg-indigo-50 text-indigo-700 border border-indigo-100",
        badgeGlow: "shadow-indigo-500/30"
    },
    {
        bg: "bg-gradient-to-br from-cyan-500/[0.03] to-sky-500/[0.03] hover:from-cyan-500/[0.08] hover:to-sky-500/[0.08]",
        border: "border-slate-200/80 hover:border-cyan-500/50",
        selectedBg: "bg-gradient-to-br from-cyan-500/15 via-sky-500/10 to-transparent border-cyan-600 shadow-md shadow-cyan-500/10",
        accentText: "text-cyan-700",
        iconContainer: "bg-gradient-to-tr from-cyan-600 to-sky-500 text-white shadow-lg shadow-cyan-500/20",
        arrowColor: "text-cyan-500",
        pillBg: "bg-cyan-50 text-cyan-700 border border-cyan-100",
        badgeGlow: "shadow-cyan-500/30"
    }
];

function getCardTheme(idx: number) {
    return CARD_THEMES[idx % CARD_THEMES.length];
}

export default function ProductosGlobalPage() {
    const router = useRouter();

    const [exporting, setExporting] = useState(false);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [globalData, setGlobalData] = useState<{ TotalVenta: number; TotalProductos: number } | null>(null);
    const [articulos, setArticulos] = useState<Articulo[]>([]);
    const [startDate, setStartDate] = useState(getFirstOfMonth());
    const [endDate, setEndDate] = useState(getToday());

    const [selectedSucursal, setSelectedSucursal] = useState<Branch | null>(null);
    const [selectedArticleForSales, setSelectedArticleForSales] = useState<Articulo | null>(null);
    const [selectedVenta, setSelectedVenta] = useState<VentaDetalle | null>(null);

    const [articleSales, setArticleSales] = useState<VentaDetalle[]>([]);
    const [loadingArticleSales, setLoadingArticleSales] = useState(false);
    const [errorArticleSales, setErrorArticleSales] = useState<string | null>(null);
    const [isArticleSalesModalOpen, setIsArticleSalesModalOpen] = useState(false);

    const [loadingBranches, setLoadingBranches] = useState(false);
    const [loadingArticulos, setLoadingArticulos] = useState(false);

    const [errorBranches, setErrorBranches] = useState<string | null>(null);
    const [errorArticulos, setErrorArticulos] = useState<string | null>(null);

    const [initialSucursalId, setInitialSucursalId] = useState<string | null>(null);
    const [initialArticuloId, setInitialArticuloId] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState('');

    const filteredBranches = useMemo(() => {
        return branches.filter(b => b.Nombre.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [branches, searchTerm]);

    const showAllBranchesCard = useMemo(() => {
        if (!searchTerm) return true;
        return 'todas las sucursales'.includes(searchTerm.toLowerCase());
    }, [searchTerm]);

    const filteredArticulos = useMemo(() => {
        const query = searchTerm.toLowerCase();
        return articulos.filter(a => 
            a.Articulo.toLowerCase().includes(query) || 
            (a.Codigo && a.Codigo.toLowerCase().includes(query)) ||
            String(a.IdArticulo).toLowerCase().includes(query)
        );
    }, [articulos, searchTerm]);

    // Product Trends States
    const [selectedArticleForTrends, setSelectedArticleForTrends] = useState<Articulo | null>(null);
    const [isTrendsModalOpen, setIsTrendsModalOpen] = useState(false);
    const [trendsData, setTrendsData] = useState<any[]>([]);
    const [loadingTrends, setLoadingTrends] = useState(false);
    const [errorTrends, setErrorTrends] = useState<string | null>(null);
    const [trendsStartDate, setTrendsStartDate] = useState(getPastDate(6));
    const [trendsEndDate, setTrendsEndDate] = useState(getToday());
    const [trendsGroupBy, setTrendsGroupBy] = useState<'dia' | 'semana' | 'mes'>('semana');
    const [trendsPeriod, setTrendsPeriod] = useState<'1m' | '3m' | '6m' | '1y' | 'custom'>('6m');

    const handleTrendsSelect = (e: React.MouseEvent, art: Articulo) => {
        e.stopPropagation();
        setSelectedArticleForTrends(art);
        setTrendsPeriod('6m');
        setTrendsStartDate(getPastDate(6));
        setTrendsEndDate(getToday());
        setTrendsGroupBy('semana');
        setIsTrendsModalOpen(true);
    };

    const handleTrendsPeriodChange = (period: '1m' | '3m' | '6m' | '1y' | 'custom') => {
        setTrendsPeriod(period);
        if (period === '1m') {
            setTrendsStartDate(getPastDate(1));
            setTrendsEndDate(getToday());
        } else if (period === '3m') {
            setTrendsStartDate(getPastDate(3));
            setTrendsEndDate(getToday());
        } else if (period === '6m') {
            setTrendsStartDate(getPastDate(6));
            setTrendsEndDate(getToday());
        } else if (period === '1y') {
            setTrendsStartDate(getPastDate(12));
            setTrendsEndDate(getToday());
        }
    };

    const formatDateTick = (dateStr: string, groupBy: 'dia' | 'semana' | 'mes') => {
        if (!dateStr) return '';
        try {
            const parts = dateStr.split('-');
            if (parts.length < 3) return dateStr;
            const year = parts[0];
            const month = parts[1];
            const day = parts[2].substring(0, 2);

            const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            const monthName = months[parseInt(month, 10) - 1] || month;

            if (groupBy === 'mes') {
                return `${monthName} ${year}`;
            } else if (groupBy === 'semana') {
                return `Sem. ${day}/${monthName}`;
            } else {
                return `${day} ${monthName}`;
            }
        } catch (e) {
            return dateStr;
        }
    };

    useEffect(() => {
        if (!isTrendsModalOpen || !selectedArticleForTrends) {
            return;
        }

        let isMounted = true;
        const fetchTrends = async () => {
            setLoadingTrends(true);
            setErrorTrends(null);
            setTrendsData([]);

            try {
                const response = await fetch(
                    `/api/reportes/productos/tendencias?startDate=${trendsStartDate}&endDate=${trendsEndDate}&idArticulo=${selectedArticleForTrends.IdArticulo}&sucursalId=${selectedSucursal?.IdSucursal || 'all'}&groupBy=${trendsGroupBy}`
                );
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las tendencias');
                if (isMounted) setTrendsData(result.data || []);
            } catch (err: any) {
                if (isMounted) setErrorTrends(err.message || 'Error desconocido');
            } finally {
                if (isMounted) setLoadingTrends(false);
            }
        };

        fetchTrends();
        return () => { isMounted = false; };
    }, [isTrendsModalOpen, selectedArticleForTrends, selectedSucursal, trendsStartDate, trendsEndDate, trendsGroupBy]);

    const aggregateTrends = useMemo(() => {
        let totalSales = 0;
        let totalQuantity = 0;
        let totalTickets = 0;

        trendsData.forEach((row) => {
            totalSales += Number(row.Total) || 0;
            totalQuantity += Number(row.Cantidad) || 0;
            totalTickets += Number(row.NumeroTickets) || 0;
        });

        const averageTicket = totalTickets > 0 ? totalSales / totalTickets : 0;

        return {
            totalSales,
            totalQuantity,
            totalTickets,
            averageTicket
        };
    }, [trendsData]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const dateStr = formatDateTick(label, trendsGroupBy);
            return (
                <div className="bg-white/95 backdrop-blur-md p-4 rounded-xl shadow-xl border border-slate-200/60 max-w-xs space-y-2.5">
                    <p className="text-xs font-black text-slate-800 tracking-tight uppercase border-b border-slate-100 pb-1.5">{dateStr}</p>
                    <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-6">
                            <span className="flex items-center gap-1.5 text-slate-500 font-semibold">
                                <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                                Venta total:
                            </span>
                            <span className="font-extrabold text-blue-700">{formatCurrency(payload[0].value)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-6">
                            <span className="flex items-center gap-1.5 text-slate-500 font-semibold">
                                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                Cantidad:
                            </span>
                            <span className="font-extrabold text-amber-700">{Number(payload[1]?.value || 0).toLocaleString()} un.</span>
                        </div>
                        {payload[0]?.payload?.NumeroTickets !== undefined && (
                            <div className="flex items-center justify-between gap-6 border-t border-slate-100/80 pt-1 mt-1 text-[11px]">
                                <span className="flex items-center gap-1.5 text-slate-400 font-medium">
                                    Tickets:
                                </span>
                                <span className="font-bold text-slate-650">{payload[0].payload.NumeroTickets} tkt</span>
                            </div>
                        )}
                    </div>
                </div>
            );
        }
        return null;
    };



    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const start = params.get('startDate') || getFirstOfMonth();
        const end = params.get('endDate') || getToday();

        setStartDate(start);
        setEndDate(end);
        setInitialSucursalId(params.get('sucursalId'));
        setInitialArticuloId(params.get('articuloId'));
    }, []);

    const updateQueryParams = (updates: Record<string, string | null>) => {
        const nextParams = new URLSearchParams(window.location.search);
        Object.entries(updates).forEach(([key, value]) => {
            if (value) nextParams.set(key, value);
            else nextParams.delete(key);
        });
        router.push(`?${nextParams.toString()}`, { scroll: false });
    };

    const handleSucursalSelect = (branch: Branch) => {
        setSearchTerm('');
        setSelectedSucursal(branch);
        setSelectedArticleForSales(null);
        setArticleSales([]);
        setSelectedVenta(null);
        updateQueryParams({ sucursalId: String(branch.IdSucursal), articuloId: null, startDate, endDate });
    };

    const handleArticleSelect = (art: Articulo) => {
        setSelectedArticleForSales(art);
        setArticleSales([]);
        setSelectedVenta(null);
        setIsArticleSalesModalOpen(true);
        updateQueryParams({ articuloId: String(art.IdArticulo) });
    };

    useEffect(() => {
        if (!startDate || !endDate) return;

        let isMounted = true;
        const fetchBranches = async () => {
            setLoadingBranches(true);
            setErrorBranches(null);

            try {
                const response = await fetch(`/api/reportes/productos/sucursales?startDate=${startDate}&endDate=${endDate}&sucursalId=all`);
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las sucursales');
                if (isMounted) {
                    setBranches(result.data || []);
                    setGlobalData(result.global || null);
                }
            } catch (err: any) {
                if (isMounted) setErrorBranches(err.message || 'Error desconocido');
            } finally {
                if (isMounted) setLoadingBranches(false);
            }
        };

        fetchBranches();
        return () => { isMounted = false; };
    }, [startDate, endDate]);

    useEffect(() => {
        if (!selectedSucursal) {
            setArticulos([]);
            setSelectedArticleForSales(null);
            setArticleSales([]);
            setSelectedVenta(null);
            return;
        }

        let isMounted = true;
        const fetchArticulos = async () => {
            setLoadingArticulos(true);
            setErrorArticulos(null);
            setArticulos([]);
            setSelectedArticleForSales(null);
            setArticleSales([]);
            setSelectedVenta(null);

            try {
                const response = await fetch(`/api/reportes/productos?startDate=${startDate}&endDate=${endDate}&sucursalId=${selectedSucursal.IdSucursal}`);
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'No se pudieron cargar los artículos');
                if (isMounted) setArticulos(result.data || []);
            } catch (err: any) {
                if (isMounted) setErrorArticulos(err.message || 'Error desconocido');
            } finally {
                if (isMounted) setLoadingArticulos(false);
            }
        };

        fetchArticulos();
        return () => { isMounted = false; };
    }, [selectedSucursal, startDate, endDate]);

    useEffect(() => {
        if (!isArticleSalesModalOpen || !selectedArticleForSales) {
            return;
        }

        let isMounted = true;
        const fetchArticleSales = async () => {
            setLoadingArticleSales(true);
            setErrorArticleSales(null);
            setArticleSales([]);

            try {
                const response = await fetch(`/api/reportes/productos/ventas?startDate=${startDate}&endDate=${endDate}&idArticulo=${selectedArticleForSales.IdArticulo}&sucursalId=${selectedSucursal?.IdSucursal || 'all'}`);
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las ventas del artículo');
                if (isMounted) setArticleSales(result.data || []);
            } catch (err: any) {
                if (isMounted) setErrorArticleSales(err.message || 'Error desconocido');
            } finally {
                if (isMounted) setLoadingArticleSales(false);
            }
        };

        fetchArticleSales();
        return () => { isMounted = false; };
    }, [isArticleSalesModalOpen, selectedArticleForSales, selectedSucursal, startDate, endDate]);

    useEffect(() => {
        if (!initialSucursalId) return;

        if (initialSucursalId === 'all' && branches.length > 0) {
            const totalBranch = {
                IdSucursal: 'all',
                Nombre: 'Todas las Sucursales',
                TotalVenta: globalData?.TotalVenta || 0,
                TotalProductos: globalData?.TotalProductos || 0,
            };
            setSelectedSucursal(totalBranch);
            return;
        }

        const branch = branches.find((branch) => String(branch.IdSucursal) === initialSucursalId);
        if (branch) setSelectedSucursal(branch);
    }, [initialSucursalId, branches, globalData]);

    useEffect(() => {
        if (!selectedSucursal || !initialArticuloId || selectedArticleForSales) return;
        const article = articulos.find((art) => String(art.IdArticulo) === initialArticuloId);
        if (article) {
            setSelectedArticleForSales(article);
            setIsArticleSalesModalOpen(true);
        }
    }, [selectedSucursal, articulos, initialArticuloId, selectedArticleForSales]);

    const handleParamChange = (key: string, value: string) => {
        const nextParams = new URLSearchParams(window.location.search);
        if (value) nextParams.set(key, value);
        else nextParams.delete(key);
        router.push(`?${nextParams.toString()}`);

        if (key === 'startDate') setStartDate(value || getFirstOfMonth());
        if (key === 'endDate') setEndDate(value || getToday());
    };

    const formatCurrency = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return val;
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
    };

    const handleExportPDF = async () => {
        setExporting(true);
        try {
            const doc = new jsPDF();
            
            // Header title and metadata
            doc.setFontSize(18);
            doc.setTextColor(30, 41, 59); // Slate 800
            
            const isGlobal = !selectedSucursal;
            const title = isGlobal 
                ? 'Reporte Global de Productos por Sucursal' 
                : `Reporte de Artículos Vendidos - ${selectedSucursal.Nombre}`;
            
            doc.text(title, 14, 20);
            
            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139); // Slate 500
            doc.text(`Periodo: ${startDate} al ${endDate}`, 14, 28);
            if (selectedSucursal) {
                doc.text(`Sucursal Seleccionada: ${selectedSucursal.Nombre}`, 14, 33);
            }
            doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, selectedSucursal ? 38 : 33);
            
            const startY = selectedSucursal ? 46 : 41;
            
            if (isGlobal) {
                // Table: Branches Summary
                const headers = [["Sucursal", "Venta Total", "Artículos Distintos"]];
                const rows = [];
                
                if (allBranchesTotal) {
                    rows.push([
                        allBranchesTotal.Nombre,
                        formatCurrency(allBranchesTotal.TotalVenta),
                        allBranchesTotal.TotalProductos.toString()
                    ]);
                }
                
                filteredBranches.forEach((branch) => {
                    rows.push([
                        branch.Nombre,
                        formatCurrency(branch.TotalVenta),
                        branch.TotalProductos.toString()
                    ]);
                });
                
                autoTable(doc, {
                    head: headers,
                    body: rows,
                    startY: startY,
                    theme: 'striped',
                    headStyles: { fillColor: [30, 41, 59] },
                    styles: { fontSize: 9, cellPadding: 4 },
                    columnStyles: {
                        1: { halign: 'right' },
                        2: { halign: 'right' }
                    }
                });
            } else {
                // Table: Detailed Articles
                const headers = [["Artículo", "Código", "Cantidad", "Total de Venta", "Tickets (Ops)", "Ticket Promedio"]];
                const rows = filteredArticulos.map((art) => [
                    art.Articulo,
                    art.Codigo || art.IdArticulo.toString(),
                    art.Cantidad.toString(),
                    formatCurrency(art.Total),
                    art.NumeroTickets.toString(),
                    formatCurrency(art.TicketPromedio)
                ]);
                
                autoTable(doc, {
                    head: headers,
                    body: rows,
                    startY: startY,
                    theme: 'striped',
                    headStyles: { fillColor: [30, 41, 59] },
                    styles: { fontSize: 8.5, cellPadding: 3.5 },
                    columnStyles: {
                        1: { halign: 'left' },
                        2: { halign: 'right' },
                        3: { halign: 'right' },
                        4: { halign: 'right' },
                        5: { halign: 'right' }
                    }
                });
            }
            
            const filename = isGlobal 
                ? `Reporte_Global_Productos_${startDate}_a_${endDate}.pdf`
                : `Reporte_Productos_${selectedSucursal.Nombre.replace(/\s+/g, '_')}_${startDate}_a_${endDate}.pdf`;
                
            doc.save(filename);
        } catch (err) {
            console.error("Error exporting PDF:", err);
        } finally {
            setExporting(false);
        }
    };

    const clearSucursalSelection = () => {
        setSearchTerm('');
        setSelectedSucursal(null);
        setSelectedArticleForSales(null);
        setArticleSales([]);
        setSelectedVenta(null);
        updateQueryParams({ sucursalId: null, articuloId: null });
    };

    const allBranchesTotal = useMemo(() => {
        if (branches.length === 0) return null;
        return {
            IdSucursal: 'all',
            Nombre: 'Todas las Sucursales',
            TotalVenta: globalData?.TotalVenta || 0,
            TotalProductos: globalData?.TotalProductos || 0,
        };
    }, [branches, globalData]);

    return (
        <div className="space-y-6 pb-12">
            {/* Header with Filters & Periods */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white py-4 px-6 rounded-2xl shadow-sm border border-slate-100 animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3 select-none">
                        <Package className="text-blue-600" />
                        Productos Global
                    </h1>

                    <DatePresetsProfesores />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                        <Calendar size={16} className="text-blue-500" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Del</span>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => handleParamChange('startDate', e.target.value)}
                            className="bg-transparent text-xs font-bold text-slate-700 outline-none p-0 border-none h-auto w-28 cursor-pointer"
                        />
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                        <Calendar size={16} className="text-blue-500" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Al</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => handleParamChange('endDate', e.target.value)}
                            className="bg-transparent text-xs font-bold text-slate-700 outline-none p-0 border-none h-auto w-28 cursor-pointer"
                        />
                    </div>
                    <button
                        onClick={() => {
                            handleParamChange('startDate', startDate);
                        }}
                        className="p-2.5 bg-slate-50 border border-slate-200 text-blue-600 hover:bg-slate-100 hover:border-slate-300 transition-all rounded-xl shadow-sm"
                        disabled={loadingBranches || loadingArticulos}
                        title="Actualizar Datos"
                    >
                        <RefreshCcw size={16} className={cn((loadingBranches || loadingArticulos) && "animate-spin")} />
                    </button>
                    <button
                        onClick={handleExportPDF}
                        disabled={exporting}
                        className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 hover:border-rose-300 transition-all rounded-xl shadow-sm text-xs font-bold disabled:opacity-50"
                        title="Exportar Reporte a PDF"
                    >
                        <FileText size={16} className={cn(exporting && "animate-pulse")} />
                        <span className="hidden sm:inline">{exporting ? 'Exportando...' : 'Exportar PDF'}</span>
                    </button>
                </div>
            </div>

            {!selectedSucursal && (
                <section className="space-y-4 animate-in fade-in duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/60 shadow-xs">
                        <div>
                            <h2 className="text-xl font-semibold text-slate-900">Sucursales</h2>
                            <p className="text-sm text-slate-500">Haz clic en una sucursal para ver los artículos vendidos en ella.</p>
                        </div>
                        {/* Search Bar */}
                        <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-500/10 focus-within:border-blue-500 transition-all w-full sm:w-64 max-w-sm">
                            <Search size={16} className="text-slate-400 mr-2 shrink-0" />
                            <input
                                type="text"
                                placeholder="Buscar sucursal..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-transparent text-xs font-semibold text-slate-700 outline-none p-0 border-none h-auto w-full"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="p-1 hover:bg-slate-200/60 rounded-full transition-colors text-slate-400 hover:text-slate-650"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    {loadingBranches ? (
                        <div className="flex items-center justify-center h-48 rounded-3xl bg-white border border-slate-200">
                            <Loader2 className="animate-spin text-blue-600" size={28} />
                        </div>
                    ) : errorBranches ? (
                        <div className="rounded-3xl bg-red-50 border border-red-200 text-red-700 p-6">{errorBranches}</div>
                    ) : filteredBranches.length === 0 && !showAllBranchesCard ? (
                        <div className="rounded-3xl bg-slate-50 border border-slate-200 text-slate-500 p-8 text-center">No se encontraron sucursales que coincidan con su búsqueda.</div>
                    ) : (
                        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                            {showAllBranchesCard && allBranchesTotal && (() => {
                                const theme = getCardTheme(0);
                                const isSelected = (selectedSucursal as any)?.IdSucursal === 'all';
                                return (
                                    <div
                                        onClick={() => handleSucursalSelect(allBranchesTotal)}
                                        className={cn(
                                            'cursor-pointer rounded-xl border p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg relative overflow-hidden group select-none flex flex-col justify-between min-h-[140px]',
                                            isSelected ? theme.selectedBg : `bg-white ${theme.border} ${theme.bg}`
                                        )}
                                    >
                                        <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-bl-full pointer-events-none transition-transform duration-500 group-hover:scale-110"></div>
                                        <div className={cn("absolute left-0 top-0 bottom-0 w-1 transition-colors duration-300", isSelected ? "bg-gradient-to-b from-indigo-600 to-purple-600" : "bg-slate-200 group-hover:bg-indigo-500")}></div>

                                        <div>
                                            <div className="flex items-center justify-between gap-2 mb-3">
                                                <div className="flex items-center gap-2">
                                                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 shadow-xs", theme.iconContainer)}>
                                                        <LayoutGrid size={16} />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-sm font-extrabold text-slate-800 truncate max-w-[120px] tracking-tight">{allBranchesTotal.Nombre}</h3>
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Global</p>
                                                    </div>
                                                </div>
                                                <div className={cn("transition-all duration-300 transform group-hover:translate-x-0.5", theme.arrowColor)}>
                                                    <ArrowRight size={14} />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2 mt-auto pt-2 border-t border-slate-100/80">
                                            <div className="flex items-baseline justify-between gap-1">
                                                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Venta Global</span>
                                                <span className={cn("text-base font-black tracking-tight", theme.accentText)}>
                                                    {formatCurrency(allBranchesTotal.TotalVenta)}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-[11px]">
                                                <span className="text-slate-400 font-semibold">Artículos Distintos</span>
                                                <span className={cn("font-bold text-[10px] px-2 py-0.25 rounded-full", theme.pillBg)}>
                                                    {allBranchesTotal.TotalProductos}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {filteredBranches.map((branch, idx) => {
                                const theme = getCardTheme(idx + 1);
                                const isSelected = (selectedSucursal as any)?.IdSucursal === branch.IdSucursal;
                                return (
                                    <div
                                        key={branch.IdSucursal}
                                        onClick={() => handleSucursalSelect(branch)}
                                        className={cn(
                                            'cursor-pointer rounded-xl border p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg relative overflow-hidden group select-none flex flex-col justify-between min-h-[140px]',
                                            isSelected ? theme.selectedBg : `bg-white ${theme.border} ${theme.bg}`
                                        )}
                                    >
                                        <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-current opacity-[0.04] rounded-bl-full pointer-events-none transition-transform duration-500 group-hover:scale-110"></div>
                                        <div className={cn("absolute left-0 top-0 bottom-0 w-1 transition-colors duration-300", isSelected ? "bg-gradient-to-b from-blue-600 to-indigo-600" : "bg-slate-200 group-hover:bg-blue-500")}></div>

                                        <div>
                                            <div className="flex items-center justify-between gap-2 mb-3">
                                                <div className="flex items-center gap-2">
                                                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 shadow-xs", theme.iconContainer)}>
                                                        <Store size={16} />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-sm font-extrabold text-slate-800 truncate max-w-[120px] tracking-tight">{branch.Nombre}</h3>
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sucursal</p>
                                                    </div>
                                                </div>
                                                <div className={cn("transition-all duration-300 transform group-hover:translate-x-0.5", theme.arrowColor)}>
                                                    <ArrowRight size={14} />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2 mt-auto pt-2 border-t border-slate-100/80">
                                            <div className="flex items-baseline justify-between gap-1">
                                                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Venta Total</span>
                                                <span className={cn("text-base font-black tracking-tight", theme.accentText)}>
                                                    {formatCurrency(branch.TotalVenta)}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-[11px]">
                                                <span className="text-slate-400 font-semibold">Artículos Distintos</span>
                                                <span className={cn("font-bold text-[10px] px-2 py-0.25 rounded-full", theme.pillBg)}>
                                                    {branch.TotalProductos}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {selectedSucursal && (
                <section className="space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/60 shadow-xs animate-in fade-in duration-250">
                        <div className="flex flex-col gap-1">
                            {/* Breadcrumbs */}
                            <div className="flex items-center flex-wrap gap-1.5 text-xs font-bold text-slate-400 select-none">
                                <button
                                    onClick={clearSucursalSelection}
                                    className="hover:text-blue-600 hover:underline transition-colors duration-150"
                                >
                                    Sucursales
                                </button>
                                <ChevronRight size={12} className="text-slate-300" />
                                <span className="text-slate-800 font-extrabold">{selectedSucursal.Nombre}</span>
                            </div>
                            <h2 className="text-lg font-black text-slate-800 tracking-tight uppercase mt-0.5">Artículos en {selectedSucursal.Nombre}</h2>
                        </div>

                        {/* Search Bar */}
                        <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-500/10 focus-within:border-blue-500 transition-all w-full md:w-64 max-w-sm">
                            <Search size={16} className="text-slate-400 mr-2 shrink-0" />
                            <input
                                type="text"
                                placeholder="Buscar artículo..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-transparent text-xs font-semibold text-slate-700 outline-none p-0 border-none h-auto w-full"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="p-1 hover:bg-slate-200/60 rounded-full transition-colors text-slate-400 hover:text-slate-650"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    {loadingArticulos ? (
                        <div className="flex items-center justify-center h-48 rounded-3xl bg-white border border-slate-200">
                            <Loader2 className="animate-spin text-blue-600" size={28} />
                        </div>
                    ) : errorArticulos ? (
                        <div className="rounded-3xl bg-red-50 border border-red-200 text-red-700 p-6">{errorArticulos}</div>
                    ) : filteredArticulos.length === 0 ? (
                        <div className="rounded-3xl bg-slate-50 border border-slate-200 text-slate-500 p-6">No se encontraron artículos vendidos para su búsqueda.</div>
                    ) : (
                        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 animate-in fade-in duration-300">
                            {filteredArticulos.map((art) => {
                                const isSelected = selectedArticleForSales?.IdArticulo === art.IdArticulo;
                                return (
                                    <div
                                        key={art.IdArticulo}
                                        onClick={() => handleArticleSelect(art)}
                                        className={cn(
                                            'cursor-pointer rounded-xl border border-slate-200/60 p-3.5 shadow-xs border-l-[3px] hover-premium transition-all duration-200 bg-white flex flex-col justify-between min-h-[135px]',
                                            isSelected ? 'bg-amber-50/20 border-l-amber-600' : 'border-l-amber-500 hover:border-l-amber-600'
                                        )}
                                    >
                                        <div>
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <div className="flex items-start gap-1.5 min-w-0">
                                                    <div className="bg-amber-500/10 w-7 h-7 rounded-md flex items-center justify-center text-amber-600 border border-amber-500/20 shrink-0 mt-0.5">
                                                        <FileText size={14} />
                                                    </div>
                                                    <div className="min-w-0 flex flex-col">
                                                        <h3 className="text-xs font-extrabold text-slate-800 truncate tracking-tight min-w-0" title={art.Articulo}>{art.Articulo}</h3>
                                                        <span className="text-[10px] text-slate-400 font-bold select-none tracking-wider mt-0.5">Código: #{art.Codigo || art.IdArticulo}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        onClick={(e) => handleTrendsSelect(e, art)}
                                                        className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-700 rounded-lg transition-all border border-blue-100 hover:border-blue-200"
                                                        title="Ver tendencias de ventas"
                                                    >
                                                        <TrendingUp size={13} />
                                                    </button>
                                                    <div className="text-slate-400 group-hover:translate-x-0.5 transition-transform"><ArrowRight size={14} /></div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5 text-[11px] text-slate-500 pt-2 border-t border-slate-100 mt-auto">
                                            <div className="flex items-center justify-between">
                                                <span className="font-semibold text-slate-400">Cantidad / Total</span>
                                                <span className="font-bold text-slate-800">{art.Cantidad} · {formatCurrency(art.Total)}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="font-semibold text-slate-400">Tickets / Promedio</span>
                                                <span className="font-bold text-slate-850">{art.NumeroTickets} · {formatCurrency(art.TicketPromedio)}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {isArticleSalesModalOpen && selectedArticleForSales && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col animate-in scale-in duration-200">
                        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-5 bg-slate-50">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">Ventas del artículo</h2>
                                <p className="text-sm text-slate-500">{selectedArticleForSales.Articulo} · {selectedSucursal?.Nombre || 'Todas las sucursales'}</p>
                            </div>
                            <button
                                onClick={() => {
                                    setIsArticleSalesModalOpen(false);
                                    setSelectedArticleForSales(null);
                                    updateQueryParams({ articuloId: null });
                                }}
                                className="text-slate-550 hover:text-slate-900 transition-colors font-bold text-sm bg-slate-100 hover:bg-slate-200/80 px-4 py-2 rounded-xl"
                            >
                                Cerrar
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-6">
                            {loadingArticleSales ? (
                                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                                    <Loader2 className="animate-spin mb-4 text-blue-600" size={28} />
                                    <p className="font-semibold text-sm">Cargando ventas del artículo...</p>
                                </div>
                            ) : errorArticleSales ? (
                                <div className="rounded-3xl bg-red-50 border border-red-200 text-red-700 p-6">{errorArticleSales}</div>
                            ) : articleSales.length === 0 ? (
                                <div className="rounded-3xl bg-slate-50 border border-slate-200 text-slate-500 p-6">No se encontraron ventas para este artículo.</div>
                            ) : (
                                <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                                    <table className="min-w-full text-left text-sm">
                                        <thead className="bg-slate-50 text-slate-500 uppercase tracking-[0.2em] text-[11px] border-b border-slate-200">
                                            <tr>
                                                <th className="px-5 py-4">Folio</th>
                                                <th className="px-5 py-4">Fecha</th>
                                                <th className="px-5 py-4">Sucursal</th>
                                                <th className="px-5 py-4 text-right">Cantidad</th>
                                                <th className="px-5 py-4 text-right">Total Art.</th>
                                                <th className="px-5 py-4 text-right">Total Venta</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {articleSales.map((venta) => (
                                                <tr
                                                    key={`${venta.IdVenta}-${venta.IdSucursal}`}
                                                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                                                    onClick={() => {
                                                        setSelectedVenta(venta);
                                                    }}
                                                >
                                                    <td className="px-5 py-4 font-medium text-slate-900">{venta.Folio}</td>
                                                    <td className="px-5 py-4 text-slate-650">{venta.Fecha}</td>
                                                    <td className="px-5 py-4 text-slate-650">{venta.Sucursal}</td>
                                                    <td className="px-5 py-4 text-right text-slate-900 font-semibold">{venta.CantidadArticulo}</td>
                                                    <td className="px-5 py-4 text-right text-slate-900 font-semibold">{formatCurrency(venta.TotalArticulo)}</td>
                                                    <td className="px-5 py-4 text-right text-slate-900 font-semibold">{formatCurrency(venta.TotalVenta)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isTrendsModalOpen && selectedArticleForTrends && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col animate-in scale-in duration-200">
                        {/* Header */}
                        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 bg-slate-50">
                            <div>
                                <h2 className="text-lg font-extrabold text-slate-900 tracking-tight uppercase flex items-center gap-2 select-none">
                                    <TrendingUp size={20} className="text-blue-600" />
                                    Tendencias de venta de artículo
                                </h2>
                                <p className="text-xs font-semibold text-slate-500">
                                    {selectedArticleForTrends.Articulo} · <span className="font-bold text-blue-600">{selectedSucursal?.Nombre || 'Todas las sucursales'}</span>
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setIsTrendsModalOpen(false);
                                    setSelectedArticleForTrends(null);
                                    setTrendsData([]);
                                }}
                                className="p-2 hover:bg-slate-200/80 rounded-full transition-all text-slate-400 hover:text-slate-700"
                                title="Cerrar modal"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content Scrollable */}
                        <div className="flex-1 overflow-auto p-6 space-y-6">
                            {/* Controls Row */}
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200/60 shadow-xs">
                                {/* Periodo selectors */}
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mr-1">Periodo:</span>
                                    {(['1m', '3m', '6m', '1y', 'custom'] as const).map((p) => {
                                        const labels = { '1m': '1 Mes', '3m': '3 Meses', '6m': '6 Meses', '1y': '1 Año', 'custom': 'Personalizado' };
                                        const active = trendsPeriod === p;
                                        return (
                                            <button
                                                key={p}
                                                onClick={() => handleTrendsPeriodChange(p)}
                                                className={cn(
                                                    "px-3 py-1.5 text-xs font-bold rounded-xl border transition-all duration-200",
                                                    active
                                                        ? "bg-blue-600 border-blue-600 text-white shadow-xs"
                                                        : "bg-white border-slate-200 text-slate-650 hover:bg-slate-50"
                                                )}
                                            >
                                                {labels[p]}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Date pickers for custom period */}
                                {trendsPeriod === 'custom' && (
                                    <div className="flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                                        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-2xs">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase">Del:</span>
                                            <input
                                                type="date"
                                                value={trendsStartDate}
                                                onChange={(e) => setTrendsStartDate(e.target.value)}
                                                className="bg-transparent text-xs font-bold text-slate-700 outline-none p-0 border-none h-auto w-24 cursor-pointer"
                                            />
                                        </div>
                                        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-2xs">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase">Al:</span>
                                            <input
                                                type="date"
                                                value={trendsEndDate}
                                                onChange={(e) => setTrendsEndDate(e.target.value)}
                                                className="bg-transparent text-xs font-bold text-slate-700 outline-none p-0 border-none h-auto w-24 cursor-pointer"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Group by: Dia, Semana, Mes */}
                                <div className="flex items-center gap-2 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-200/80">
                                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mr-1">Agrupar por:</span>
                                    <div className="bg-white border border-slate-200 rounded-xl p-0.5 flex shadow-2xs">
                                        {(['dia', 'semana', 'mes'] as const).map((g) => {
                                            const labels = { dia: 'Día', semana: 'Semana', mes: 'Mes' };
                                            const active = trendsGroupBy === g;
                                            return (
                                                <button
                                                    key={g}
                                                    onClick={() => setTrendsGroupBy(g)}
                                                    className={cn(
                                                        "px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200",
                                                        active
                                                            ? "bg-slate-900 text-white shadow-xs"
                                                            : "bg-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                                                    )}
                                                >
                                                    {labels[g]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Aggregate Metrics Row */}
                            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                                {/* Venta Total */}
                                <div className="bg-gradient-to-br from-blue-500/[0.02] to-indigo-500/[0.02] border border-slate-200/60 rounded-2xl p-4 flex flex-col justify-between shadow-xs select-none">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Venta Total ($)</span>
                                    <span className="text-xl font-black text-blue-700 tracking-tight mt-1">{formatCurrency(aggregateTrends.totalSales)}</span>
                                </div>
                                {/* Unidades Vendidas */}
                                <div className="bg-gradient-to-br from-amber-500/[0.02] to-orange-500/[0.02] border border-slate-200/60 rounded-2xl p-4 flex flex-col justify-between shadow-xs select-none">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unidades Vendidas</span>
                                    <span className="text-xl font-black text-amber-700 tracking-tight mt-1">{Number(aggregateTrends.totalQuantity).toLocaleString()} un.</span>
                                </div>
                                {/* Tickets */}
                                <div className="bg-gradient-to-br from-emerald-500/[0.02] to-teal-500/[0.02] border border-slate-200/60 rounded-2xl p-4 flex flex-col justify-between shadow-xs select-none">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Tickets</span>
                                    <span className="text-xl font-black text-emerald-700 tracking-tight mt-1">{Number(aggregateTrends.totalTickets).toLocaleString()} tkts.</span>
                                </div>
                                {/* Ticket Promedio */}
                                <div className="bg-gradient-to-br from-purple-500/[0.02] to-fuchsia-500/[0.02] border border-slate-200/60 rounded-2xl p-4 flex flex-col justify-between shadow-xs select-none">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ticket Promedio</span>
                                    <span className="text-xl font-black text-purple-700 tracking-tight mt-1">{formatCurrency(aggregateTrends.averageTicket)}</span>
                                </div>
                            </div>

                            {/* Chart Area */}
                            <div className="bg-white rounded-3xl border border-slate-200 p-5 min-h-[400px] flex flex-col justify-center relative overflow-hidden shadow-xs">
                                {loadingTrends ? (
                                    <div className="flex flex-col items-center justify-center space-y-3">
                                        <Loader2 className="animate-spin text-blue-600" size={36} />
                                        <p className="text-sm font-semibold text-slate-500">Cargando datos de tendencias...</p>
                                    </div>
                                ) : errorTrends ? (
                                    <div className="rounded-2xl bg-red-50 border border-red-200 text-red-700 p-6 max-w-lg mx-auto text-center">
                                        <p className="font-bold text-sm">Error al cargar datos</p>
                                        <p className="text-xs text-red-600/90 mt-1">{errorTrends}</p>
                                    </div>
                                ) : trendsData.length === 0 ? (
                                    <div className="text-center py-12 max-w-sm mx-auto space-y-2 select-none">
                                        <div className="w-12 h-12 bg-slate-50 text-slate-400 border border-slate-200/60 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
                                            <TrendingUp size={22} className="stroke-[1.5]" />
                                        </div>
                                        <h3 className="font-extrabold text-slate-800 text-sm tracking-tight">Sin datos para graficar</h3>
                                        <p className="text-xs text-slate-400 font-semibold leading-relaxed">No se registraron ventas de este producto en el periodo y sucursal seleccionados.</p>
                                    </div>
                                ) : (
                                    <div className="w-full flex-1">
                                        <ResponsiveContainer width="100%" height={350}>
                                            <AreaChart data={trendsData} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
                                                <defs>
                                                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/>
                                                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.01}/>
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis
                                                    dataKey="Fecha"
                                                    tickFormatter={(str) => formatDateTick(str, trendsGroupBy)}
                                                    stroke="#94a3b8"
                                                    fontSize={10}
                                                    tickLine={false}
                                                    axisLine={false}
                                                    dy={10}
                                                />
                                                <YAxis
                                                    yAxisId="left"
                                                    stroke="#2563eb"
                                                    fontSize={10}
                                                    tickLine={false}
                                                    axisLine={false}
                                                    tickFormatter={(val) => formatCurrency(val)}
                                                />
                                                <YAxis
                                                    yAxisId="right"
                                                    orientation="right"
                                                    stroke="#d97706"
                                                    fontSize={10}
                                                    tickLine={false}
                                                    axisLine={false}
                                                    tickFormatter={(val) => Number(val).toLocaleString()}
                                                />
                                                <Tooltip content={<CustomTooltip />} />
                                                <Legend
                                                    verticalAlign="top"
                                                    height={36}
                                                    iconType="circle"
                                                    iconSize={8}
                                                    formatter={(value) => <span className="text-xs font-bold text-slate-600 select-none">{value}</span>}
                                                />
                                                <Area
                                                    yAxisId="left"
                                                    type="monotone"
                                                    dataKey="Total"
                                                    name="Ventas ($)"
                                                    stroke="#2563eb"
                                                    strokeWidth={2}
                                                    fillOpacity={1}
                                                    fill="url(#colorTotal)"
                                                />
                                                <Line
                                                    yAxisId="right"
                                                    type="monotone"
                                                    dataKey="Cantidad"
                                                    name="Unidades Vendidas"
                                                    stroke="#d97706"
                                                    strokeWidth={2.5}
                                                    dot={{ r: 3, strokeWidth: 1.5, fill: "#fff" }}
                                                    activeDot={{ r: 5 }}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4 bg-slate-50">
                            <button
                                onClick={() => {
                                    setIsTrendsModalOpen(false);
                                    setSelectedArticleForTrends(null);
                                    setTrendsData([]);
                                }}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-all border border-slate-200"
                            >
                                Cerrar Ventana
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <VentasItemDetailModal
                isOpen={selectedVenta !== null}
                onClose={() => {
                    setSelectedVenta(null);
                    if (selectedArticleForSales) setIsArticleSalesModalOpen(true);
                }}
                idVenta={selectedVenta?.IdVenta || null}
                idSucursal={selectedVenta?.IdSucursal || null}
                folioVenta={selectedVenta?.Folio || ''}
                clienteName={''}
            />
        </div>
    );
}
