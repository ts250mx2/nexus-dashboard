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
    'border-blue-500',
    'border-emerald-500',
    'border-violet-500',
    'border-amber-500',
    'border-rose-500',
    'border-cyan-500',
    'border-pink-500',
    'border-indigo-500'
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
        <div className={cn("flex items-center gap-2 px-4 py-2.5 shrink-0", color, className)}>
            <Icon size={15} />
            <span className="text-[11px] font-black uppercase tracking-wider">{title}</span>
        </div>
    );

    return (
        <div className="h-[calc(100vh-7rem)] flex flex-col bg-[#F1F5F9] text-slate-800 overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
            {/* Header Control Strip */}
            <div className="bg-white border-b border-slate-100 px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <h1 className="text-2xl font-black tracking-tight text-slate-800 uppercase flex items-center gap-3 select-none">
                        <Monitor className="text-blue-600 shrink-0" size={24} />
                        Monitor de Operaciones
                    </h1>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full px-3.5 py-1">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{data.length} sucursales activas</span>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Unified Search Filter */}
                    <div className="relative min-w-[220px] bg-slate-50 border border-slate-200 rounded-xl group focus-within:border-blue-400 transition-all">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input
                            type="text"
                            placeholder="Buscar sucursal, cajero o Z..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-transparent pl-9 pr-8 py-2 text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Quick Dates Buttons */}
                    <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 p-1 rounded-xl">
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
                                        "px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all",
                                        isActive ? "bg-slate-800 text-white shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                                    )}
                                >
                                    {btn.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Custom Calendar Picker */}
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                        <Calendar size={14} className="text-blue-500" />
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="bg-transparent text-xs font-bold text-slate-700 outline-none border-none cursor-pointer"
                        />
                    </div>

                    {/* Refresh Trigger */}
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="p-2.5 bg-slate-50 border border-slate-200 text-blue-600 hover:bg-slate-100 hover:border-slate-300 transition-all rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
                        title="Actualizar datos"
                    >
                        <RefreshCw size={16} className={cn(loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Grid Column Headers Strip */}
            <div className="bg-slate-50 flex items-center shrink-0 border-b border-slate-200 shadow-xs w-full">
                <ColumnHeader title="Tiendas / Sucursales" icon={Store} color="bg-blue-50 text-blue-700 border-r border-slate-200" className="w-1/5 shrink-0" />
                <ColumnHeader title="Aperturas de Caja" icon={Monitor} color="bg-amber-50 text-amber-700 border-r border-slate-200" className="w-1/5 shrink-0" />
                <ColumnHeader title="Ventas por Terminal" icon={Receipt} color="bg-emerald-50 text-emerald-700 border-r border-slate-200" className="w-1/5 shrink-0" />
                <ColumnHeader title="Mov. Cancelados" icon={Ban} color="bg-rose-50 text-rose-700 border-r border-slate-200" className="w-1/5 shrink-0" />
                <ColumnHeader title="Cierres de Caja" icon={Lock} color="bg-indigo-50 text-indigo-700" className="w-1/5 shrink-0" />
            </div>

            {/* Kanban Content Area */}
            {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-[#F1F5F9] gap-3">
                    <RefreshCw className="animate-spin text-blue-500" size={32} />
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500 animate-pulse">Sincronizando estado de cajas...</span>
                </div>
            ) : error ? (
                <div className="flex-1 flex items-center justify-center p-8 bg-[#F1F5F9]">
                    <div className="max-w-md bg-white border border-rose-200 p-8 rounded-2xl shadow-sm text-center">
                        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
                        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-800 mb-2">Error de conexión</h2>
                        <p className="text-xs text-slate-500 font-medium leading-relaxed mb-6">{error}</p>
                        <button
                            onClick={fetchData}
                            className="px-6 py-2.5 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-700 rounded-xl transition-all"
                        >
                            Reintentar Conexión
                        </button>
                    </div>
                </div>
            ) : filteredData.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-[#F1F5F9] gap-2">
                    <Store className="text-slate-300" size={40} />
                    <span className="text-xs font-black uppercase tracking-widest text-slate-400">No se encontraron operaciones registradas</span>
                </div>
            ) : (
                <div className="flex-1 overflow-auto bg-[#F1F5F9] divide-y divide-slate-200">
                    <div className="flex flex-col h-full">
                        {filteredData.map(store => {
                            const storeColorIdx = getStoreColorIndex(store.name);
                            const borderTheme = STORE_COLORS[storeColorIdx];

                            return (
                                <div key={store.id} className="flex group transition-colors hover:bg-white/60 border-b border-slate-200">
                                    {/* Column 1: Store Summary Card */}
                                    <div className="p-3 border-r border-slate-200 w-1/5 shrink-0 bg-white/50 flex flex-col justify-center min-w-0">
                                        <div
                                            onClick={() => handleOpenOpeningModal(store.id, store.name)}
                                            className={cn(
                                                "relative bg-white border-l-4 p-4 flex flex-col gap-2 rounded-xl transition-all duration-200 cursor-pointer hover:shadow-md hover:scale-[1.01] active:scale-[0.99] border-slate-200 shadow-xs",
                                                borderTheme
                                            )}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sucursal</span>
                                                <Store size={13} className="text-slate-400" />
                                            </div>
                                            <h4 className="text-[13px] font-black text-slate-800 leading-tight uppercase truncate">
                                                {store.name}
                                            </h4>

                                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-3 border-t border-slate-100">
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Aperturas</span>
                                                    <span className="text-[13px] font-black text-blue-600 tracking-tight">{store.aperturas}</span>
                                                </div>
                                                <div className="flex flex-col text-right">
                                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Ventas</span>
                                                    <span className="text-[13px] font-black text-emerald-600 tracking-tight">{formatCurrency(store.ventas)}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Tickets</span>
                                                    <span className="text-[13px] font-black text-slate-700 tracking-tight">{store.ventasCount}</span>
                                                </div>
                                                <div className="flex flex-col text-right">
                                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Ticket Prom.</span>
                                                    <span className="text-[13px] font-black text-amber-600 tracking-tight">{formatCurrency(store.ticketPromedio)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Columns 2–5: Openings and associated registers */}
                                    <div className="flex flex-col w-4/5 divide-y divide-slate-100 min-w-0">
                                        {store.details.openings.length > 0 ? (
                                            store.details.openings.map((op, idx) => (
                                                <div key={idx} className="flex w-full">
                                                    {/* Column 2: Aperturas */}
                                                    <div className="p-3 border-r border-slate-200 w-1/4 shrink-0 flex flex-col justify-center min-w-0">
                                                        <div
                                                            onClick={() => handleOpenSalesModal(store.id, store.name, op.IdApertura, op.Caja)}
                                                            className="bg-white border border-slate-200 hover:border-amber-300 hover:bg-amber-50/40 px-4 py-3 flex flex-col gap-2 rounded-xl transition-all cursor-pointer hover:shadow-sm hover:scale-[1.01] active:scale-[0.99]"
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <span className="bg-amber-50 border border-amber-200 text-amber-700 text-[10px] px-2 py-0.5 font-black rounded-md">Z: {op.Z}</span>
                                                                <Monitor size={12} className="text-amber-500" />
                                                            </div>
                                                            <div className="mt-0.5">
                                                                <span className="text-[13px] font-black text-slate-700">Hora: {op.HoraApertura}</span>
                                                            </div>
                                                            <div>
                                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Cajero Responsable</p>
                                                                <p className="text-xs font-bold text-slate-600 uppercase truncate leading-none">{op.Cajero || 'N/A'}</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Column 3: Ventas por Terminal */}
                                                    <div className="p-3 border-r border-slate-200 w-1/4 shrink-0 flex flex-col justify-center min-w-0">
                                                        {op.Total > 0 ? (
                                                            <div
                                                                onClick={() => handleOpenSalesModal(store.id, store.name, op.IdApertura, op.Caja)}
                                                                className="bg-white border border-emerald-200 hover:bg-emerald-50/50 px-4 py-3.5 flex flex-col gap-1.5 rounded-xl transition-all cursor-pointer hover:shadow-sm hover:scale-[1.01] active:scale-[0.99]"
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] px-2 py-0.5 font-black rounded-md">Z: {op.Z}</span>
                                                                    <Receipt size={12} className="text-emerald-500" />
                                                                </div>
                                                                <p className="text-[15px] font-black text-emerald-700 leading-tight mt-1">{formatCurrency(op.Total)}</p>
                                                                <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">{op.Operaciones} transacciones</p>
                                                            </div>
                                                        ) : (
                                                            <div className="text-center italic text-slate-300 text-[10px] font-bold uppercase tracking-wider py-4">Sin Ventas ($0.00)</div>
                                                        )}
                                                    </div>

                                                    {/* Column 4: Cancelaciones */}
                                                    <div className="p-3 border-r border-slate-200 w-1/4 shrink-0 flex flex-col justify-center min-w-0">
                                                        {op.cancelaciones > 0 ? (
                                                            <div
                                                                onClick={() => handleOpenCancellationModal(store.id, store.name, op.IdApertura, op.Caja)}
                                                                className="bg-white border border-rose-200 hover:bg-rose-50/50 px-4 py-3.5 flex flex-col gap-1.5 rounded-xl transition-all cursor-pointer hover:shadow-sm hover:scale-[1.01] active:scale-[0.99]"
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <span className="bg-rose-50 border border-rose-200 text-rose-700 text-[10px] px-2 py-0.5 font-black rounded-md">Z: {op.Z}</span>
                                                                    <Ban size={12} className="text-rose-500" />
                                                                </div>
                                                                <p className="text-[15px] font-black text-rose-700 leading-tight mt-1">{formatCurrency(op.cancelacionesMonto)}</p>
                                                                <p className="text-[9px] font-bold text-rose-600 uppercase tracking-wider">{op.cancelaciones} cancelados</p>
                                                            </div>
                                                        ) : (
                                                            <div className="text-center italic text-slate-300 text-[10px] font-bold uppercase tracking-wider py-4">--</div>
                                                        )}
                                                    </div>

                                                    {/* Column 5: Cierres de Caja */}
                                                    <div className="p-3 w-1/4 shrink-0 flex flex-col justify-center min-w-0">
                                                        {op.HoraCierre && op.Supervisor ? (
                                                            <div
                                                                onClick={() => handleOpenClosingTicketModal(store.id, store.name, op.IdApertura, op.Caja)}
                                                                className="bg-white border border-indigo-200 hover:bg-indigo-50/50 px-4 py-3 flex flex-col gap-2 rounded-xl transition-all cursor-pointer hover:shadow-sm hover:scale-[1.01] active:scale-[0.99]"
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] px-2 py-0.5 font-black rounded-md">Z: {op.Z}</span>
                                                                    <Lock size={12} className="text-indigo-500" />
                                                                </div>
                                                                <p className="text-[13px] font-black text-indigo-700 leading-tight">Cierre: {op.HoraCierre}</p>
                                                                <div className="grid grid-cols-2 gap-2 mt-0.5 pt-1.5 border-t border-indigo-100">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">Duración</span>
                                                                        <span className="text-[10px] font-black text-indigo-600 uppercase truncate">
                                                                            {formatDuration(op.RawFechaApertura, op.RawFechaCierre) || '--'}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex flex-col text-right">
                                                                        <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">Cerró</span>
                                                                        <span className="text-[10px] font-black text-indigo-600 uppercase truncate">{op.Supervisor}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="text-center text-amber-500 text-[10px] font-black uppercase tracking-widest py-4 flex items-center justify-center gap-1.5">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                                                                <span>Caja Abierta</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="flex w-full min-h-[120px]">
                                                <div className="border-r border-slate-200 w-1/4 shrink-0 flex items-center justify-center italic text-slate-300 text-[10px] font-black uppercase tracking-widest">Sin Aperturas</div>
                                                <div className="border-r border-slate-200 w-1/4 shrink-0 flex items-center justify-center italic text-slate-300 text-[10px] font-black uppercase tracking-widest">--</div>
                                                <div className="border-r border-slate-200 w-1/4 shrink-0 flex items-center justify-center italic text-slate-300 text-[10px] font-black uppercase tracking-widest">--</div>
                                                <div className="w-1/4 shrink-0 flex items-center justify-center italic text-slate-300 text-[10px] font-black uppercase tracking-widest">--</div>
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
            <div className="bg-white border-t border-slate-100 px-6 py-2.5 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="text-slate-500">Monitoreo Operativo Activo</span>
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
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white border border-slate-200 shadow-xl rounded-2xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <Store size={20} className="text-blue-600" />
                        <div>
                            <h2 className="text-base font-black text-slate-800 uppercase tracking-tight">Historial de Aperturas</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{storeName} · {fecha}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExport}
                            disabled={rows.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50"
                        >
                            <FileSpreadsheet size={14} />
                            Exportar Excel
                        </button>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-[#F8FAFC]">
                    {loading ? (
                        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
                            <RefreshCw className="animate-spin text-blue-500" size={24} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Cargando aperturas...</span>
                        </div>
                    ) : error ? (
                        <div className="h-64 flex items-center justify-center text-rose-500 text-xs font-bold uppercase tracking-wider">{error}</div>
                    ) : rows.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-slate-400 text-xs font-bold uppercase tracking-wider">No hay aperturas en esta fecha</div>
                    ) : (
                        <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 text-slate-500 uppercase tracking-wider font-bold bg-slate-50 sticky top-0">
                                    <th className="px-4 py-3">Z (Arqueo)</th>
                                    <th className="px-4 py-3">Caja / Terminal</th>
                                    <th className="px-4 py-3">Fecha y Hora Apertura</th>
                                    <th className="px-4 py-3">Cajero Responsable</th>
                                    <th className="px-4 py-3 text-right">Tickets</th>
                                    <th className="px-4 py-3 text-right">Monto Total</th>
                                    <th className="px-4 py-3">Fecha y Hora Cierre</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                                {rows.map((row, i) => (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-bold text-blue-600">{row.Z}</td>
                                        <td className="px-4 py-3 font-semibold">Terminal {row.Caja}</td>
                                        <td className="px-4 py-3">{new Date(row['Fecha Apertura']).toLocaleString('es-MX')}</td>
                                        <td className="px-4 py-3 uppercase font-bold text-slate-800">{row.Cajero}</td>
                                        <td className="px-4 py-3 text-right font-bold">{row.Tickets}</td>
                                        <td className="px-4 py-3 text-right font-black text-emerald-600">{formatCurrency(row['Total Venta'])}</td>
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
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white border border-slate-200 shadow-xl rounded-2xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <Ban size={20} className="text-rose-500" />
                        <div>
                            <h2 className="text-base font-black text-slate-800 uppercase tracking-tight">Detalle de Cancelaciones</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                {storeName} · {fecha} {openingId ? `· Z: ${openingId}` : ''}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-auto bg-[#F8FAFC]">
                    {loading ? (
                        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
                            <RefreshCw className="animate-spin text-blue-500" size={24} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Cargando cancelaciones...</span>
                        </div>
                    ) : error ? (
                        <div className="h-64 flex items-center justify-center text-rose-500 text-xs font-bold uppercase tracking-wider">{error}</div>
                    ) : rows.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-slate-400 text-xs font-bold uppercase tracking-wider">Sin movimientos de cancelación</div>
                    ) : (
                        <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 text-slate-500 uppercase tracking-wider font-bold bg-slate-50 sticky top-0">
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
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                                {rows.map((row, i) => (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-bold text-blue-600">{row.Z}</td>
                                        <td className="px-4 py-3 font-bold text-slate-800">{row['Folio Cancelacion']}</td>
                                        <td className="px-4 py-3">{new Date(row.FechaCancelacion).toLocaleString('es-MX')}</td>
                                        <td className="px-4 py-3 text-slate-500 font-mono">{row['Codigo Barras']}</td>
                                        <td className="px-4 py-3 uppercase text-slate-700 font-semibold">{row.Descripcion}</td>
                                        <td className="px-4 py-3 text-right font-bold text-amber-600">{row.Cantidad}</td>
                                        <td className="px-4 py-3 text-right">{formatCurrency(row['Precio Venta'])}</td>
                                        <td className="px-4 py-3 text-right font-black text-rose-600">{formatCurrency(row.Total)}</td>
                                        <td className="px-4 py-3 uppercase text-[10px] font-bold">{row.Cajero}</td>
                                        <td className="px-4 py-3 uppercase text-[10px] font-black text-slate-500">{row.Supervisor}</td>
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
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white border border-slate-200 shadow-xl rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-xl">
                            <Receipt size={16} className="text-indigo-600" />
                        </div>
                        <div>
                            <h3 className="font-black text-sm uppercase tracking-wider text-slate-800">Ticket de Corte Z</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                {storeName} • Terminal {cajaId} • Z {openingId}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* monospaced ticket container */}
                <div className="flex-1 overflow-auto bg-[#F8FAFC] p-6 flex justify-center border-y border-slate-100">
                    {loading ? (
                        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2 w-full">
                            <RefreshCw className="animate-spin text-blue-500" size={24} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Generando arqueo...</span>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center gap-3">
                            <AlertCircle size={36} className="text-rose-500" />
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest leading-relaxed">{error}</p>
                        </div>
                    ) : (
                        <div className="bg-white text-slate-900 shadow-sm p-6 border border-slate-200 w-full rounded-xl font-mono text-[10px] md:text-[11px] leading-relaxed whitespace-pre overflow-x-auto select-all max-w-[400px]">
                            {ticketText}
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="bg-white border-t border-slate-100 p-4 flex items-center justify-between">
                    <button
                        onClick={handlePrint}
                        disabled={loading || !ticketText}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50"
                    >
                        <Printer size={12} />
                        Imprimir Ticket
                    </button>
                    <button
                        onClick={onClose}
                        className="px-5 py-2 bg-slate-100 text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
