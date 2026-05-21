"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Calendar,
    RefreshCcw,
    Store,
    LayoutGrid,
    ChevronRight,
    ArrowLeft,
    TrendingUp,
    ListFilter
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ResponsiveContainer, Treemap } from 'recharts';

const COLORS = [
    '#3B82F6', // Blue
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#EC4899', // Pink
    '#8B5CF6', // Purple
    '#06B6D4', // Cyan
    '#F97316', // Orange
    '#EF4444', // Red
    '#14B8A6', // Teal
    '#6366F1', // Indigo
    '#059669', // Dark Emerald
    '#D97706', // Dark Amber
    '#C084FC', // Light Purple
];

const getColorByName = (name: string) => {
    if (!name) return COLORS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorIndex = Math.abs(hash) % COLORS.length;
    return COLORS[colorIndex];
};

const CustomTreemapContent = (props: any) => {
    const { x, y, width, height, name, value, onClick, total } = props;
    if (width < 30 || height < 20) return null;
    const color = getColorByName(name);
    const percent = total && total > 0 ? (value / total) * 100 : 0;
    
    const displayName = name.length > 18 ? `${name.substring(0, 15)}...` : name;
    const displayLabel = percent > 0 ? `${displayName} (${percent.toFixed(1)}%)` : displayName;
    
    return (
        <g onClick={() => onClick && onClick(props)}>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                style={{
                    fill: color,
                    stroke: '#ffffff',
                    strokeWidth: 2,
                    strokeOpacity: 0.9,
                    cursor: 'pointer',
                }}
                className="hover:brightness-110 hover:shadow-lg transition-all duration-300"
            />
            {width > 65 && height > 35 && (
                <text
                    x={x + width / 2}
                    y={y + height / 2 - 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#fff"
                    fontSize={11}
                    fontWeight="300"
                    className="select-none pointer-events-none drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.7)] uppercase tracking-tight"
                >
                    {displayLabel}
                </text>
            )}
            {width > 65 && height > 50 && (
                <text
                    x={x + width / 2}
                    y={y + height / 2 + 12}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="rgba(255,255,255,0.95)"
                    fontSize={10}
                    fontWeight="400"
                    className="select-none pointer-events-none drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.7)]"
                >
                    {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value)}
                </text>
            )}
        </g>
    );
};

export default function CategoriasGlobalPage() {
    const getFormattedDate = (offset = 0) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getStartOfWeek = () => {
        const d = new Date();
        const day = d.getDay();
        const diff = (day + 6) % 7; // Monday-based week start
        d.setDate(d.getDate() - diff);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const dayStr = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${dayStr}`;
    };

    const today = getFormattedDate(0);
    const yesterday = getFormattedDate(-1);
    
    const currentMonthStart = (() => {
        const d = new Date();
        d.setDate(1);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}-01`;
    })();

    const [fechaInicio, setFechaInicio] = useState(currentMonthStart);
    const [fechaFin, setFechaFin] = useState(today);
    const [selectedStoreId, setSelectedStoreId] = useState<string>('all');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any[]>([]);
    const [stores, setStores] = useState<any[]>([]);

    // Drill-down states
    const [currentLevel, setCurrentLevel] = useState<'categoria' | 'producto' | 'articulo'>('categoria');
    const [selectedCategory, setSelectedCategory] = useState<{ id: number | null, name: string } | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            let url = `/api/dashboard/sales/categorias?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}&idTienda=${selectedStoreId}&level=${currentLevel}`;
            
            if (currentLevel === 'producto' && selectedCategory) {
                url += `&idCategoria=${selectedCategory.id}`;
            } else if (currentLevel === 'articulo' && selectedCategory && selectedProduct) {
                url += `&idCategoria=${selectedCategory.id}&productoName=${encodeURIComponent(selectedProduct)}`;
            }

            const res = await fetch(url);
            const json = await res.json();
            setData(json.data || []);
            setStores(json.stores || []);
        } catch (err) {
            console.error('Error fetching categories global data:', err);
        } finally {
            setLoading(false);
        }
    }, [fechaInicio, fechaFin, selectedStoreId, currentLevel, selectedCategory, selectedProduct]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleTreemapClick = (node: any) => {
        if (currentLevel === 'categoria') {
            setSelectedCategory({ id: node.IdCategoria, name: node.name });
            setCurrentLevel('producto');
        } else if (currentLevel === 'producto') {
            setSelectedProduct(node.name);
            setCurrentLevel('articulo');
        }
    };

    const handleBack = () => {
        if (currentLevel === 'articulo') {
            setSelectedProduct(null);
            setCurrentLevel('producto');
        } else if (currentLevel === 'producto') {
            setSelectedCategory(null);
            setCurrentLevel('categoria');
        }
    };

    const handleResetToLevel1 = () => {
        setSelectedCategory(null);
        setSelectedProduct(null);
        setCurrentLevel('categoria');
    };

    const handleResetToLevel2 = () => {
        setSelectedProduct(null);
        setCurrentLevel('producto');
    };

    const totalVentasMonto = useMemo(() => {
        return data.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
    }, [data]);

    const periods = [
        { label: 'Hoy', start: today, end: today },
        { label: 'Ayer', start: yesterday, end: yesterday },
        { label: 'Semana', start: getStartOfWeek(), end: today },
        { label: '7 días', start: getFormattedDate(-6), end: today },
        { label: 'Este mes', start: currentMonthStart, end: today },
        {
            label: 'Mes ant.',
            start: (() => {
                const d = new Date();
                d.setMonth(d.getMonth() - 1);
                d.setDate(1);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                return `${year}-${month}-01`;
            })(),
            end: (() => {
                const d = new Date();
                d.setDate(0);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            })()
        },
    ];

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(val);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header with Filters & Periods */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white py-4 px-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3 select-none">
                        <LayoutGrid className="text-blue-600 animate-pulse" />
                        Categorías Global
                    </h1>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Quick Date Period Buttons */}
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

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                            <Calendar size={16} className="text-blue-500" />
                            <input
                                type="date"
                                value={fechaInicio}
                                onChange={(e) => setFechaInicio(e.target.value)}
                                className="bg-transparent text-xs font-bold text-slate-700 outline-none p-0 border-none h-auto w-28 cursor-pointer"
                            />
                        </div>
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                            <Calendar size={16} className="text-blue-500" />
                            <input
                                type="date"
                                value={fechaFin}
                                onChange={(e) => setFechaFin(e.target.value)}
                                className="bg-transparent text-xs font-bold text-slate-700 outline-none p-0 border-none h-auto w-28 cursor-pointer"
                            />
                        </div>
                        <button
                            onClick={fetchData}
                            className="p-2.5 bg-slate-50 border border-slate-200 text-blue-600 hover:bg-slate-100 hover:border-slate-300 transition-all rounded-xl shadow-sm"
                            title="Actualizar Datos"
                        >
                            <RefreshCcw size={16} className={cn(loading && "animate-spin")} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Area with Sidebar and Treemap Chart */}
            <div className="flex flex-col lg:flex-row gap-6">
                {/* Branch selector list card */}
                <div className="lg:w-72 shrink-0">
                    <div className="bg-white border border-slate-100 shadow-sm overflow-hidden flex flex-col h-[580px] rounded-2xl">
                        <div className="p-4 bg-slate-50 border-b border-slate-100">
                             <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 select-none">
                                <Store size={14} />
                                Seleccionar Sucursal
                             </h2>
                        </div>
                        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-1 bg-white">
                            <button
                                onClick={() => setSelectedStoreId('all')}
                                className={cn(
                                    "w-full flex items-center justify-between p-3.5 transition-all border-l-4 rounded-xl group mb-2 select-none",
                                    selectedStoreId === 'all' 
                                        ? "bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/10"
                                        : "bg-white text-slate-600 border-transparent hover:bg-slate-50 hover:border-slate-200"
                                    )}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black transition-all",
                                        selectedStoreId === 'all' ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                                    )}>
                                        AZ
                                    </div>
                                    <span className="text-xs font-black tracking-tight uppercase">Todas las sucursales</span>
                                </div>
                                <ChevronRight size={14} className={cn(
                                    "transition-transform",
                                    selectedStoreId === 'all' ? "translate-x-0" : "-translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0"
                                )} />
                            </button>

                            {stores.map((store, i) => {
                                const isActive = selectedStoreId === store.IdSucursal.toString();
                                const color = getColorByName(store.Tienda);
                                return (
                                    <button
                                        key={store.IdSucursal}
                                        onClick={() => setSelectedStoreId(store.IdSucursal.toString())}
                                        className={cn(
                                            "w-full flex items-center justify-between p-3.5 transition-all border-l-4 rounded-xl group select-none",
                                            isActive 
                                                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-100 border-l-4"
                                                : "bg-white text-slate-600 border-transparent hover:bg-slate-50"
                                        )}
                                        style={{ borderLeftColor: isActive ? color : 'transparent' }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div 
                                                className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black text-white shadow-sm"
                                                style={{ backgroundColor: color }}
                                            >
                                                {store.Tienda.substring(0, 2).toUpperCase()}
                                            </div>
                                            <span className={cn(
                                                "text-xs font-black tracking-tight uppercase",
                                                isActive ? "text-slate-900" : "text-slate-500 group-hover:text-slate-800"
                                            )}>{store.Tienda}</span>
                                        </div>
                                        <ChevronRight size={14} className={cn(
                                            "transition-transform text-slate-400",
                                            isActive ? "translate-x-0" : "-translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0"
                                        )} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Treemap Chart Area */}
                <div className="flex-1 min-w-0">
                    <div className="bg-white border border-slate-100 shadow-sm relative p-5 h-[580px] rounded-2xl flex flex-col justify-between">
                        <div>
                            {/* Breadcrumbs / Header controls */}
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 pb-4 border-b border-slate-100 select-none">
                                <div className="flex items-center flex-wrap gap-2 text-xs font-bold text-slate-400">
                                    <button 
                                        onClick={handleResetToLevel1}
                                        className={cn(
                                            "transition-colors duration-150 py-1 px-2 rounded-lg",
                                            currentLevel === 'categoria' ? "bg-slate-100 text-slate-800 font-extrabold" : "hover:text-blue-600 hover:bg-blue-50"
                                        )}
                                    >
                                        Categorías
                                    </button>
                                    
                                    {selectedCategory && (
                                        <>
                                            <ChevronRight size={14} className="text-slate-300" />
                                            <button 
                                                onClick={handleResetToLevel2}
                                                className={cn(
                                                    "transition-colors duration-150 py-1 px-2 rounded-lg truncate max-w-[150px]",
                                                    currentLevel === 'producto' ? "bg-slate-100 text-slate-800 font-extrabold" : "hover:text-blue-600 hover:bg-blue-50"
                                                )}
                                                title={selectedCategory.name}
                                            >
                                                {selectedCategory.name}
                                            </button>
                                        </>
                                    )}

                                    {selectedProduct && (
                                        <>
                                            <ChevronRight size={14} className="text-slate-300" />
                                            <span 
                                                className="bg-slate-100 text-slate-800 font-extrabold py-1 px-2 rounded-lg truncate max-w-[180px]"
                                                title={selectedProduct}
                                            >
                                                {selectedProduct}
                                            </span>
                                        </>
                                    )}
                                </div>

                                <div className="flex items-center gap-3">
                                    {currentLevel !== 'categoria' && (
                                        <button
                                            onClick={handleBack}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-650 hover:text-slate-800 transition-all rounded-xl text-xs font-bold shadow-2xs"
                                        >
                                            <ArrowLeft size={13} />
                                            Atrás
                                        </button>
                                    )}
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-xl text-blue-700">
                                        <TrendingUp size={13} />
                                        <span className="text-[10px] font-black uppercase tracking-wider">Venta Total: {formatCurrency(totalVentasMonto)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Chart Render */}
                        <div className="flex-1 min-h-0 relative flex items-center justify-center">
                            {loading ? (
                                <div className="absolute inset-0 z-50 bg-white/70 backdrop-blur-[1px] flex flex-col items-center justify-center gap-3 rounded-2xl">
                                    <RefreshCcw size={32} className="animate-spin text-blue-500" />
                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest animate-pulse">Generando rectángulos...</p>
                                </div>
                            ) : data.length === 0 ? (
                                <div className="text-center py-12 max-w-sm mx-auto space-y-3 select-none">
                                    <div className="w-12 h-12 bg-slate-50 text-slate-400 border border-slate-200/60 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
                                        <ListFilter size={22} className="stroke-[1.5]" />
                                    </div>
                                    <h3 className="font-extrabold text-slate-800 text-sm tracking-tight">Sin ventas registradas</h3>
                                    <p className="text-xs text-slate-400 font-semibold leading-relaxed">No se encontraron ventas para este nivel de selección en el periodo y sucursal indicados.</p>
                                </div>
                            ) : (
                                <div className="w-full h-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <Treemap
                                            data={data}
                                            dataKey="value"
                                            stroke="#fff"
                                            fill="#8884d8"
                                            content={<CustomTreemapContent onClick={handleTreemapClick} total={totalVentasMonto} />}
                                        />
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>

                        {/* Legend / Breadcrumbs info help */}
                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-[10px] text-slate-400 select-none">
                            <span className="font-bold uppercase tracking-wider">
                                Click en un rectángulo para desglosar · {currentLevel === 'categoria' ? 'Categorías Globales' : currentLevel === 'producto' ? 'Productos de la Categoría' : 'Artículos del Producto'}
                            </span>
                            <span className="font-bold uppercase tracking-widest bg-slate-50 border border-slate-200/60 rounded-lg px-2 py-0.5">
                                {data.length} elementos
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
