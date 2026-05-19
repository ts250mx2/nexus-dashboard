'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
    Calendar, 
    Store, 
    Receipt, 
    Ban, 
    Lock,
    RefreshCw,
    AlertCircle,
    Monitor,
    Search,
    X,
    FileSpreadsheet,
    Printer,
    ArrowUpDown,
    Download
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import VentasDetailModal from '@/components/VentasDetailModal';

// --- TS Interfaces ---
interface OpeningDetail {
    IdSucursal: number;
    IdApertura: number;
    Z: string;
    Caja: number;
    Cajero: string;
    Total: number;
    Operaciones: number;
    HoraApertura: string;
    HoraCierre: string | null;
    Supervisor: string | null;
    cancelaciones: number;
    cancelacionesMonto: number;
    RawFechaApertura: string;
    RawFechaCierre: string | null;
}

interface BranchOp {
    id: number;
    name: string;
    aperturas: number;
    ventas: number;
    ventasCount: number;
    ticketPromedio: number;
    details: {
        openings: OpeningDetail[];
        cancelaciones: number;
        cancelacionesMonto: number;
        cortes: number;
    }
}

// --- Store Color Palette Map ---
const STORE_COLORS = [
    'border-blue-500 text-blue-500', 
    'border-emerald-500 text-emerald-500', 
    'border-indigo-500 text-indigo-500', 
    'border-violet-500 text-violet-500', 
    'border-amber-500 text-amber-500', 
    'border-rose-500 text-rose-500',
    'border-cyan-500 text-cyan-500',
    'border-pink-500 text-pink-500'
];

const getStoreColorIndex = (name: string) => {
    if (!name) return 0;
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % STORE_COLORS.length;
};

export default function OperationsKanbanPage() {
    const [date, setDate] = useState<string>(() => {
        const d = new Date();
        const offset = d.getTimezoneOffset();
        const local = new Date(d.getTime() - (offset * 60 * 1000));
        return local.toISOString().split('T')[0];
    });
    
    const [data, setData] = useState<BranchOp[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Search Filter
    const [searchTerm, setSearchTerm] = useState('');

    // Modal States
    const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);
    const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
    const [isCancellationModalOpen, setIsCancellationModalOpen] = useState(false);
    const [isClosingTicketModalOpen, setIsClosingTicketModalOpen] = useState(false);
    
    const [selectedStore, setSelectedStore] = useState<{ id: number, name: string } | null>(null);
    const [selectedOpeningId, setSelectedOpeningId] = useState<number | null>(null);
    const [selectedCajaId, setSelectedCajaId] = useState<number | null>(null);

    // Filter logic for searching branch name, cashier, or Z code
    const filteredData = useMemo(() => {
        const sTerm = searchTerm.toLowerCase().trim();
        if (!sTerm) return data;

        return data.map(store => {
            const matchStore = store.name.toLowerCase().includes(sTerm);
            const filteredOpenings = store.details.openings.filter(op => {
                const matchCashier = (op.Cajero || '').toLowerCase().includes(sTerm);
                const matchZ = (op.Z || '').toLowerCase().includes(sTerm) || 
                              op.IdApertura.toString().includes(sTerm);
                return matchCashier || matchZ;
            });

            if (matchStore) {
                return store;
            } else if (filteredOpenings.length > 0) {
                return {
                    ...store,
                    details: {
                        ...store.details,
                        openings: filteredOpenings
                    }
                };
            }
            return null;
        }).filter(Boolean) as BranchOp[];
    }, [data, searchTerm]);

    const handleOpenSalesModal = (storeId: number, storeName: string, openingId?: number, cajaId?: number) => {
        setSelectedStore({ id: storeId, name: storeName });
        setSelectedOpeningId(openingId || null);
        setSelectedCajaId(cajaId || null);
        setIsSalesModalOpen(true);
    };

    const handleOpenOpeningModal = (storeId: number, storeName: string) => {
        setSelectedStore({ id: storeId, name: storeName });
        setIsOpeningModalOpen(true);
    };

    const handleOpenCancellationModal = (storeId: number, storeName: string, openingId?: number, cajaId?: number) => {
        setSelectedStore({ id: storeId, name: storeName });
        setSelectedOpeningId(openingId || null);
        setSelectedCajaId(cajaId || null);
        setIsCancellationModalOpen(true);
    };

    const handleOpenClosingTicketModal = (storeId: number, storeName: string, openingId: number, cajaId: number) => {
        setSelectedStore({ id: storeId, name: storeName });
        setSelectedOpeningId(openingId);
        setSelectedCajaId(cajaId);
        setIsClosingTicketModalOpen(true);
    };

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/dashboard/operations?fecha=${date}`);
            const json = await res.json();
            
            if (!res.ok) {
                throw new Error(json.error || 'Error al obtener datos');
            }
            
            if (Array.isArray(json)) {
                setData(json);
            } else {
                throw new Error('La respuesta de la API no es válida');
            }
        } catch (err: any) {
            console.error('Error fetching operations:', err);
            setError(err.message);
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [date]);

    const handleQuickDate = (days: number) => {
        const d = new Date();
        d.setDate(d.getDate() - days);
        const offset = d.getTimezoneOffset();
        const local = new Date(d.getTime() - (offset * 60 * 1000));
        setDate(local.toISOString().split('T')[0]);
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);
    };

    const formatDuration = (start: string, end: string | null) => {
        if (!end) return null;
        const d1 = new Date(start);
        const d2 = new Date(end);
        const diffMs = d2.getTime() - d1.getTime();
        if (isNaN(diffMs) || diffMs < 0) return null;
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        return `${diffHrs}h ${diffMins}m`;
    };

    // --- Inner Components for Columns ---
    const ColumnHeader = ({ title, icon: Icon, color, className }: any) => (
        <div className={cn("flex items-center gap-2 px-4 py-2.5 text-white shrink-0 shadow-sm border-r border-slate-700/50", color, className)}>
            <Icon size={16} className="animate-pulse" />
            <span className="text-[11px] font-black uppercase tracking-wider">{title}</span>
        </div>
    );

    return (
        <div className="h-[calc(100vh-7rem)] flex flex-col bg-slate-950 text-slate-100 overflow-hidden rounded-2xl border border-slate-800 shadow-2xl">
            {/* Header Control Strip */}
            <div className="bg-slate-900 border-b border-slate-800 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0">
                <div className="flex flex-col">
                    <h1 className="text-xl font-black tracking-tight text-white uppercase flex items-center gap-3">
                        <span className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">📊</span>
                        MONITOR DE OPERACIONES
                    </h1>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        Estado en tiempo real · {data.length} sucursales con actividad
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Unified Search Filter */}
                    <div className="relative min-w-[240px] bg-slate-950 border border-slate-800 rounded-lg group focus-within:border-indigo-500 transition-all duration-300">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input
                            type="text"
                            placeholder="Buscar sucursal, cajero o Z..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-transparent pl-9 pr-8 py-2 text-xs font-semibold uppercase tracking-wider text-slate-200 placeholder:text-slate-500 focus:outline-none"
                        />
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-rose-400 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Quick Dates Buttons */}
                    <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-1 rounded-lg">
                        {[
                            { label: 'Hoy', days: 0 },
                            { label: 'Ayer', days: 1 },
                            { label: 'Antier', days: 2 },
                        ].map(btn => {
                            const d = new Date();
                            d.setDate(d.getDate() - btn.days);
                            const offset = d.getTimezoneOffset();
                            const local = new Date(d.getTime() - (offset * 60 * 1000));
                            const btnDate = local.toISOString().split('T')[0];
                            const isActive = date === btnDate;
                            return (
                                <button
                                    key={btn.label}
                                    onClick={() => handleQuickDate(btn.days)}
                                    className={cn(
                                        "px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-md transition-all duration-300",
                                        isActive ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20" : "text-slate-400 hover:text-white hover:bg-slate-900"
                                    )}
                                >
                                    {btn.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Custom Calendar Picker */}
                    <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg">
                        <Calendar size={14} className="text-indigo-400" />
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="bg-transparent text-xs font-bold text-slate-200 outline-none border-none cursor-pointer"
                        />
                    </div>

                    {/* Refresh Trigger */}
                    <button 
                        onClick={fetchData} 
                        disabled={loading}
                        className="p-2 bg-slate-950 border border-slate-800 text-indigo-400 hover:text-white hover:bg-slate-900 rounded-lg transition-all duration-300 disabled:opacity-50 group"
                        title="Actualizar datos"
                    >
                        <RefreshCw size={16} className={cn("transition-transform duration-500", loading ? "animate-spin" : "group-hover:rotate-180")} />
                    </button>
                </div>
            </div>

            {/* Grid Column Headers Strip */}
            <div className="bg-slate-900/60 flex items-center shrink-0 border-b border-slate-800/80 shadow-md">
                <ColumnHeader title="Tiendas / Sucursales" icon={Store} color="bg-indigo-600/10 text-indigo-400" className="w-[300px]" />
                <ColumnHeader title="Aperturas de Caja" icon={Monitor} color="bg-amber-600/10 text-amber-400" className="w-[280px]" />
                <ColumnHeader title="Ventas por Terminal" icon={Receipt} color="bg-emerald-600/10 text-emerald-400" className="w-[280px]" />
                <ColumnHeader title="Mov. Cancelados" icon={Ban} color="bg-rose-600/10 text-rose-400" className="w-[280px]" />
                <ColumnHeader title="Cierres de Caja" icon={Lock} color="bg-indigo-600/10 text-indigo-400" className="w-[280px]" />
            </div>

            {/* Kanban Content Area */}
            {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 gap-3">
                    <RefreshCw className="animate-spin text-indigo-500" size={32} />
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Sincronizando estado de cajas...</span>
                </div>
            ) : error ? (
                <div className="flex-1 flex items-center justify-center p-8 bg-slate-950">
                    <div className="max-w-md bg-slate-900 border border-rose-500/20 p-8 rounded-2xl shadow-2xl text-center">
                        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
                        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-100 mb-2">Error de conexión</h2>
                        <p className="text-xs text-slate-400 font-medium leading-relaxed mb-6">{error}</p>
                        <button 
                            onClick={fetchData}
                            className="px-6 py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-[0.2em] hover:bg-indigo-500 rounded-lg transition-all shadow-md shadow-indigo-600/20"
                        >
                            Reintentar Conexión
                        </button>
                    </div>
                </div>
            ) : filteredData.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 gap-2">
                    <Store className="text-slate-600 animate-bounce" size={40} />
                    <span className="text-xs font-black uppercase tracking-widest text-slate-500">No se encontraron operaciones registradas</span>
                </div>
            ) : (
                <div className="flex-1 overflow-auto bg-slate-950 divide-y divide-slate-800/80">
                    <div className="min-w-max flex flex-col">
                        {filteredData.map(store => {
                            const storeColorIdx = getStoreColorIndex(store.name);
                            const borderTheme = STORE_COLORS[storeColorIdx];
                            
                            return (
                                <div key={store.id} className="flex group transition-colors hover:bg-slate-900/10">
                                    {/* Column 1: Store Summary Card */}
                                    <div className="p-4 border-r border-slate-800/80 w-[300px] shrink-0 bg-slate-900/20 flex flex-col justify-center">
                                        <div 
                                            onClick={() => handleOpenOpeningModal(store.id, store.name)}
                                            className={cn(
                                                "relative bg-slate-900/60 border-l-4 p-4 flex flex-col gap-2 rounded-xl transition-all duration-300 cursor-pointer hover:bg-slate-900 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] border-slate-800",
                                                borderTheme
                                            )}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Sucursal</span>
                                                <Store size={14} className="opacity-80" />
                                            </div>
                                            <h4 className="text-[13px] font-black text-white leading-tight uppercase truncate">
                                                {store.name}
                                            </h4>
                                            
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-3 border-t border-slate-800/80">
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Aperturas</span>
                                                    <span className="text-[13px] font-black text-indigo-400 tracking-tight">{store.aperturas}</span>
                                                </div>
                                                <div className="flex flex-col text-right">
                                                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Ventas</span>
                                                    <span className="text-[13px] font-black text-emerald-400 tracking-tight">{formatCurrency(store.ventas)}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Tickets</span>
                                                    <span className="text-[13px] font-black text-slate-300 tracking-tight">{store.ventasCount}</span>
                                                </div>
                                                <div className="flex flex-col text-right">
                                                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Ticket Prom.</span>
                                                    <span className="text-[13px] font-black text-amber-400 tracking-tight">{formatCurrency(store.ticketPromedio)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Column 2 to 5: Openings and associated registers rows */}
                                    <div className="flex flex-col flex-1 divide-y divide-slate-800/60 bg-slate-950">
                                        {store.details.openings.length > 0 ? (
                                            store.details.openings.map((op, idx) => (
                                                <div key={idx} className="flex">
                                                    {/* Column 2: Aperturas */}
                                                    <div className="p-4 border-r border-slate-800/80 w-[280px] shrink-0 flex flex-col justify-center">
                                                        <div 
                                                            onClick={() => handleOpenSalesModal(store.id, store.name, op.IdApertura, op.Caja)}
                                                            className="relative border border-slate-800/80 bg-slate-900/35 hover:bg-slate-900/80 px-4 py-3 flex flex-col gap-2 rounded-xl transition-all duration-300 cursor-pointer hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] group"
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] px-2 py-0.5 font-black rounded-md">Z: {op.Z}</span>
                                                                <Monitor size={12} className="text-amber-400" />
                                                            </div>
                                                            <div className="mt-1">
                                                                <span className="text-[13px] font-black text-slate-200">Hora: {op.HoraApertura}</span>
                                                            </div>
                                                            <div>
                                                                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Cajero Responsable</p>
                                                                <p className="text-xs font-bold text-slate-300 uppercase truncate leading-none">{op.Cajero || 'N/A'}</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Column 3: Ventas por Terminal */}
                                                    <div className="p-4 border-r border-slate-800/80 w-[280px] shrink-0 flex flex-col justify-center">
                                                        {op.Total > 0 ? (
                                                            <div 
                                                                onClick={() => handleOpenSalesModal(store.id, store.name, op.IdApertura, op.Caja)}
                                                                className="relative border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 px-4 py-3.5 flex flex-col gap-1.5 rounded-xl transition-all duration-300 cursor-pointer hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] group"
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 font-black rounded-md">Z: {op.Z}</span>
                                                                    <Receipt size={12} className="text-emerald-400" />
                                                                </div>
                                                                <p className="text-[15px] font-black text-emerald-300 leading-tight mt-1">{formatCurrency(op.Total)}</p>
                                                                <p className="text-[9px] font-bold text-emerald-500/80 uppercase tracking-wider">{op.Operaciones} transacciones</p>
                                                            </div>
                                                        ) : (
                                                            <div className="text-center italic text-slate-600 text-[10px] font-bold uppercase tracking-wider py-4">Sin Ventas ($0.00)</div>
                                                        )}
                                                    </div>

                                                    {/* Column 4: Cancelaciones */}
                                                    <div className="p-4 border-r border-slate-800/80 w-[280px] shrink-0 flex flex-col justify-center">
                                                        {op.cancelaciones > 0 ? (
                                                            <div 
                                                                onClick={() => handleOpenCancellationModal(store.id, store.name, op.IdApertura, op.Caja)}
                                                                className="relative border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 px-4 py-3.5 flex flex-col gap-1.5 rounded-xl transition-all duration-300 cursor-pointer hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] group"
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <span className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] px-2 py-0.5 font-black rounded-md">Z: {op.Z}</span>
                                                                    <Ban size={12} className="text-rose-400" />
                                                                </div>
                                                                <p className="text-[15px] font-black text-rose-300 leading-tight mt-1">{formatCurrency(op.cancelacionesMonto)}</p>
                                                                <p className="text-[9px] font-bold text-rose-500/80 uppercase tracking-wider">{op.cancelaciones} cancelados</p>
                                                            </div>
                                                        ) : (
                                                            <div className="text-center italic text-slate-600 text-[10px] font-bold uppercase tracking-wider py-4">--</div>
                                                        )}
                                                    </div>

                                                    {/* Column 5: Cierres de Caja */}
                                                    <div className="p-4 w-[280px] shrink-0 flex flex-col justify-center">
                                                        {op.HoraCierre && op.Supervisor ? (
                                                            <div 
                                                                onClick={() => handleOpenClosingTicketModal(store.id, store.name, op.IdApertura, op.Caja)}
                                                                className="relative border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 px-4 py-3 flex flex-col gap-2 rounded-xl transition-all duration-300 cursor-pointer hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] group"
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <span className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] px-2 py-0.5 font-black rounded-md">Z: {op.Z}</span>
                                                                    <Lock size={12} className="text-indigo-400" />
                                                                </div>
                                                                
                                                                <p className="text-[13px] font-black text-indigo-300 leading-tight">Cierre: {op.HoraCierre}</p>
                                                                
                                                                <div className="grid grid-cols-2 gap-2 mt-1 pt-1.5 border-t border-indigo-500/10">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[7px] font-bold text-slate-500 uppercase tracking-wider">Duración</span>
                                                                        <span className="text-[10px] font-black text-indigo-200 uppercase truncate">
                                                                            {formatDuration(op.RawFechaApertura, op.RawFechaCierre) || '--'}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex flex-col text-right">
                                                                        <span className="text-[7px] font-bold text-slate-500 uppercase tracking-wider">Cerró</span>
                                                                        <span className="text-[10px] font-black text-indigo-200 uppercase truncate">{op.Supervisor}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="text-center text-amber-500/80 text-[10px] font-black uppercase tracking-widest py-4 flex items-center justify-center gap-1.5">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                                                                <span>Caja Abierta</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="flex flex-1 min-h-[140px]">
                                                <div className="border-r border-slate-800/80 w-[280px] shrink-0 bg-slate-950 flex items-center justify-center italic text-slate-700 text-[10px] font-black uppercase tracking-widest">Sin Aperturas</div>
                                                <div className="border-r border-slate-800/80 w-[280px] shrink-0 bg-slate-950 flex items-center justify-center italic text-slate-700 text-[10px] font-black uppercase tracking-widest">--</div>
                                                <div className="border-r border-slate-800/80 w-[280px] shrink-0 bg-slate-950 flex items-center justify-center italic text-slate-700 text-[10px] font-black uppercase tracking-widest">--</div>
                                                <div className="w-[280px] shrink-0 bg-slate-950 flex items-center justify-center italic text-slate-700 text-[10px] font-black uppercase tracking-widest">--</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Bottom Status strip */}
            <div className="bg-slate-900 border-t border-slate-800 px-6 py-3 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-md shadow-emerald-500/20"></span>
                        <span className="text-slate-300">Monitoreo Operativo Activo</span>
                    </div>
                    <span>Última Sincronización: {new Date().toLocaleTimeString()}</span>
                </div>
                <span>Nexus Operations Monitor v2.1</span>
            </div>

            {/* --- CORE LINKED SALES DETAIL MODAL --- */}
            {selectedStore && (
                <VentasDetailModal
                    isOpen={isSalesModalOpen}
                    onClose={() => setIsSalesModalOpen(false)}
                    sucursalId={selectedStore.id}
                    sucursalName={selectedStore.name}
                    startDate={date}
                    endDate={date}
                />
            )}

            {/* --- OPENINGS DETAIL MODAL (Excel exportable) --- */}
            {selectedStore && isOpeningModalOpen && (
                <OpeningDetailModal
                    isOpen={isOpeningModalOpen}
                    onClose={() => setIsOpeningModalOpen(false)}
                    storeId={selectedStore.id}
                    storeName={selectedStore.name}
                    fecha={date}
                    formatCurrency={formatCurrency}
                />
            )}

            {/* --- CANCELLATION DETAIL MODAL --- */}
            {selectedStore && isCancellationModalOpen && (
                <CancellationDetailModal
                    isOpen={isCancellationModalOpen}
                    onClose={() => setIsCancellationModalOpen(false)}
                    storeId={selectedStore.id}
                    storeName={selectedStore.name}
                    openingId={selectedOpeningId}
                    fecha={date}
                    formatCurrency={formatCurrency}
                />
            )}

            {/* --- CLOSING TICKET MONOSPACED thermal modal --- */}
            {selectedStore && isClosingTicketModalOpen && selectedOpeningId && selectedCajaId && (
                <ClosingTicketModal
                    isOpen={isClosingTicketModalOpen}
                    onClose={() => setIsClosingTicketModalOpen(false)}
                    storeId={selectedStore.id}
                    storeName={selectedStore.name}
                    openingId={selectedOpeningId}
                    cajaId={selectedCajaId}
                />
            )}
        </div>
    );
}

// ==========================================
// --- DETAILED CHILD MODALS DEFINITIONS ---
// ==========================================

// 1. OPENING DETAIL MODAL
function OpeningDetailModal({ isOpen, onClose, storeId, storeName, fecha, formatCurrency }: any) {
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            setError(null);
            fetch(`/api/dashboard/opening-details?fechaInicio=${fecha}&fechaFin=${fecha}&idTienda=${storeId}`)
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setRows(data);
                    } else {
                        throw new Error('Formato de datos no válido');
                    }
                })
                .catch(err => setError(err.message))
                .finally(() => setLoading(false));
        }
    }, [isOpen, storeId, fecha]);

    const handleExport = () => {
        if (rows.length === 0) return;
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Aperturas");
        XLSX.writeFile(workbook, `Aperturas_${storeName.replace(/\s+/g, '_')}_${fecha}.xlsx`);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-6 bg-slate-900 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <Store size={22} className="text-indigo-400 animate-pulse" />
                        <div>
                            <h2 className="text-lg font-black text-white uppercase tracking-tight">Historial de Aperturas</h2>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{storeName} · {fecha}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExport}
                            disabled={rows.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-300 disabled:opacity-50"
                        >
                            <FileSpreadsheet size={14} />
                            Exportar Excel
                        </button>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-400 transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-6 bg-slate-950/40">
                    {loading ? (
                        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
                            <RefreshCw className="animate-spin text-indigo-500" size={24} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Cargando aperturas...</span>
                        </div>
                    ) : error ? (
                        <div className="h-64 flex items-center justify-center text-rose-400 text-xs font-bold uppercase tracking-wider">{error}</div>
                    ) : rows.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-slate-500 text-xs font-bold uppercase tracking-wider">No hay aperturas en esta fecha</div>
                    ) : (
                        <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                            <thead>
                                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-bold bg-slate-900/60">
                                    <th className="px-4 py-3">Z (Arqueo)</th>
                                    <th className="px-4 py-3">Caja / Terminal</th>
                                    <th className="px-4 py-3">Fecha y Hora Apertura</th>
                                    <th className="px-4 py-3">Cajero Responsable</th>
                                    <th className="px-4 py-3 text-right">Tickets</th>
                                    <th className="px-4 py-3 text-right">Monto Total</th>
                                    <th className="px-4 py-3">Fecha y Hora Cierre</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40 text-slate-300">
                                {rows.map((row, i) => (
                                    <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                                        <td className="px-4 py-3 font-bold text-indigo-400">{row.Z}</td>
                                        <td className="px-4 py-3 font-semibold">Terminal {row.Caja}</td>
                                        <td className="px-4 py-3">{new Date(row['Fecha Apertura']).toLocaleString('es-MX')}</td>
                                        <td className="px-4 py-3 uppercase font-bold text-slate-200">{row.Cajero}</td>
                                        <td className="px-4 py-3 text-right font-bold">{row.Tickets}</td>
                                        <td className="px-4 py-3 text-right font-black text-emerald-400">{formatCurrency(row['Total Venta'])}</td>
                                        <td className="px-4 py-3 font-medium">
                                            {row.FechaCierre 
                                                ? new Date(row.FechaCierre).toLocaleString('es-MX') 
                                                : <span className="text-amber-500 font-black uppercase tracking-widest text-[9px]">Activa</span>
                                            }
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

// 2. CANCELLATION DETAIL MODAL
function CancellationDetailModal({ isOpen, onClose, storeId, storeName, openingId, fecha, formatCurrency }: any) {
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            setError(null);
            const queryUrl = `/api/dashboard/cancellation-details?fechaInicio=${fecha}&fechaFin=${fecha}&idTienda=${storeId}${openingId ? `&idApertura=${openingId}` : ''}`;
            fetch(queryUrl)
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setRows(data);
                    } else {
                        throw new Error('Formato de datos no válido');
                    }
                })
                .catch(err => setError(err.message))
                .finally(() => setLoading(false));
        }
    }, [isOpen, storeId, openingId, fecha]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-6 bg-slate-900 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <Ban size={22} className="text-rose-400 animate-pulse" />
                        <div>
                            <h2 className="text-lg font-black text-white uppercase tracking-tight">Detalle de Cancelaciones</h2>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                                {storeName} · {fecha} {openingId ? `· Z: ${openingId}` : ''}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-400 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-6 bg-slate-950/40">
                    {loading ? (
                        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
                            <RefreshCw className="animate-spin text-indigo-500" size={24} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Cargando cancelaciones...</span>
                        </div>
                    ) : error ? (
                        <div className="h-64 flex items-center justify-center text-rose-400 text-xs font-bold uppercase tracking-wider">{error}</div>
                    ) : rows.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-slate-500 text-xs font-bold uppercase tracking-wider">Sin movimientos de cancelación</div>
                    ) : (
                        <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                            <thead>
                                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-bold bg-slate-900/60">
                                    <th className="px-4 py-3">Z (Arqueo)</th>
                                    <th className="px-4 py-3">Ticket Folio</th>
                                    <th className="px-4 py-3">Fecha Cancelación</th>
                                    <th className="px-4 py-3">Código Barras</th>
                                    <th className="px-4 py-3">Descripción Artículo</th>
                                    <th className="px-4 py-3 text-right">Cant.</th>
                                    <th className="px-4 py-3 text-right">Precio Unit.</th>
                                    <th className="px-4 py-3 text-right">Total</th>
                                    <th className="px-4 py-3">Cajero</th>
                                    <th className="px-4 py-3">Autorizó</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40 text-slate-300">
                                {rows.map((row, i) => (
                                    <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                                        <td className="px-4 py-3 font-bold text-indigo-400">{row.Z}</td>
                                        <td className="px-4 py-3 font-bold text-slate-200">{row['Folio Cancelacion']}</td>
                                        <td className="px-4 py-3">{new Date(row.FechaCancelacion).toLocaleString('es-MX')}</td>
                                        <td className="px-4 py-3 text-slate-400 font-mono">{row['Codigo Barras']}</td>
                                        <td className="px-4 py-3 uppercase text-slate-200 font-semibold">{row.Descripcion}</td>
                                        <td className="px-4 py-3 text-right font-bold text-amber-400">{row.Cantidad}</td>
                                        <td className="px-4 py-3 text-right">{formatCurrency(row['Precio Venta'])}</td>
                                        <td className="px-4 py-3 text-right font-black text-rose-400">{formatCurrency(row.Total)}</td>
                                        <td className="px-4 py-3 uppercase text-[10px] font-bold">{row.Cajero}</td>
                                        <td className="px-4 py-3 uppercase text-[10px] font-black text-slate-400">{row.Supervisor}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

// 3. CLOSING TICKET MODAL
function ClosingTicketModal({ isOpen, onClose, storeId, storeName, openingId, cajaId }: any) {
    const [ticketText, setTicketText] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTicket = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/dashboard/closing-ticket?idTienda=${storeId}&idCaja=${cajaId}&idApertura=${openingId}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setTicketText(data.ticket);
        } catch (err: any) {
            console.error('Error fetching closing ticket:', err);
            setError(err.message || 'Error al cargar el ticket de corte');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && storeId && cajaId && openingId) {
            fetchTicket();
        }
    }, [isOpen, storeId, cajaId, openingId]);

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        printWindow.document.write(`
            <html>
                <head>
                    <title>Ticket de Arqueo Z - ${storeName}</title>
                    <style>
                        body {
                            font-family: 'Courier New', Courier, monospace;
                            font-size: 12px;
                            line-height: 1.4;
                            color: #000;
                            white-space: pre;
                            padding: 20px;
                        }
                    </style>
                </head>
                <body onload="window.print(); window.close();">
                    ${ticketText}
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 bg-slate-900 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                            <Receipt size={18} className="text-indigo-400" />
                        </div>
                        <div>
                            <h3 className="font-black text-sm uppercase tracking-wider text-white">Ticket de Corte Z</h3>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                                {storeName} • Terminal {cajaId} • Z {openingId}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-400 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* monospaced ticket container */}
                <div className="flex-1 overflow-auto bg-slate-950 p-6 flex justify-center border-y border-slate-800/80">
                    {loading ? (
                        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2 w-full">
                            <RefreshCw className="animate-spin text-indigo-500" size={24} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Generando arqueo...</span>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center gap-3">
                            <AlertCircle size={36} className="text-rose-500" />
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed">{error}</p>
                        </div>
                    ) : (
                        <div className="bg-white/95 text-slate-900 shadow-inner p-6 border border-slate-200 w-full rounded-lg font-mono text-[10px] md:text-[11px] leading-relaxed whitespace-pre overflow-x-auto select-all max-w-[400px]">
                            {ticketText}
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="bg-slate-900 p-4 flex items-center justify-between">
                    <button
                        onClick={handlePrint}
                        disabled={loading || !ticketText}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-300 disabled:opacity-50"
                    >
                        <Printer size={12} />
                        Imprimir Ticket
                    </button>
                    <button
                        onClick={onClose}
                        className="px-5 py-2 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
