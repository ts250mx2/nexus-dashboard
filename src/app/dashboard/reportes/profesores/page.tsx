'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    FileSpreadsheet,
    FileText,
    Loader2,
    Store,
    Calendar,
    Users,
    TrendingUp,
    MapPin,
    ChevronRight,
    ArrowUpRight,
    LayoutGrid
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import DatePresetsProfesores from '@/components/DatePresetsProfesores';
import SociosBySucursalModal from '@/components/SociosBySucursalModal';
import ProfesorVentasDetailModal from '@/components/ProfesorVentasDetailModal';
import VentasItemDetailModal from '@/components/VentasItemDetailModal';

function ReportContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [sucursalesSummary, setSucursalesSummary] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Modal State Stack
    const [isSociosModalOpen, setIsSociosModalOpen] = useState(false);
    const [selectedSucursal, setSelectedSucursal] = useState<{ id: string | number; name: string } | null>(null);

    const [isProfesorModalOpen, setIsProfesorModalOpen] = useState(false);
    const [selectedProfesor, setSelectedProfesor] = useState<{ id: number; name: string } | null>(null);

    const [isVentaModalOpen, setIsVentaModalOpen] = useState(false);
    const [selectedVenta, setSelectedVenta] = useState<{ id: number; folio: string; sucursalId: number } | null>(null);

    // Filter states from URL
    const startDate = searchParams.get('startDate') || getFirstOfMonth();
    const endDate = searchParams.get('endDate') || getToday();

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

    // Fetch branch summaries
    useEffect(() => {
        if (!startDate || !endDate) return;

        let isMounted = true;
        const fetchData = async () => {
            setLoading(true);
            setError(null);

            try {
                // Fetch for ALL sucursales
                const url = `/api/reportes/profesores/sucursales?startDate=${startDate}&endDate=${endDate}&sucursalId=all`;
                const response = await fetch(url);
                const result = await response.json();

                if (!response.ok) throw new Error(result.error || 'Failed to fetch branch summary');
                if (isMounted) setSucursalesSummary(result.data || []);
            } catch (err: any) {
                if (isMounted) setError(err.message);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData();
        return () => { isMounted = false; };
    }, [startDate, endDate]);

    const handleParamChange = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set(key, value);
        else params.delete(key);
        router.push(`?${params.toString()}`, { scroll: false });
    };

    const formatCurrency = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return val;
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
    };

    // Calculate "All Branches" totals
    const allBranchesSummary = useMemo(() => {
        if (sucursalesSummary.length === 0) return null;
        return {
            IdSucursal: 'all',
            Nombre: 'Todas las Sucursales',
            TotalVenta: sucursalesSummary.reduce((acc, curr) => acc + Number(curr.TotalVenta || 0), 0),
            TotalClientes: sucursalesSummary.reduce((acc, curr) => acc + Number(curr.TotalClientes || 0), 0),
        };
    }, [sucursalesSummary]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                        <Users className="text-blue-600" size={32} />
                        Reporte de Profesores
                    </h1>
                    <p className="text-slate-500 mt-1">Gestión de ventas y clientes por sucursal</p>
                </div>
            </div>

            {/* Filters Bar - Aligned Right */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col lg:flex-row lg:items-center justify-end gap-8">
                <div className="flex flex-col gap-1.5 lg:items-end">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        <Calendar size={14} className="text-indigo-500" />
                        Periodos Rápidos
                    </div>
                    <DatePresetsProfesores />
                </div>

                <div className="flex flex-col gap-1.5 min-w-[280px] lg:items-end">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        <Calendar size={14} className="text-indigo-500" />
                        Rango de Fechas
                    </div>
                    <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Del</span>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => handleParamChange('startDate', e.target.value)}
                                className="bg-transparent text-sm font-semibold text-slate-700 focus:outline-none cursor-pointer"
                            />
                        </div>
                        <div className="h-4 w-px bg-slate-300"></div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Al</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => handleParamChange('endDate', e.target.value)}
                                className="bg-transparent text-sm font-semibold text-slate-700 focus:outline-none cursor-pointer"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Branch Cards Grid */}
            {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center h-64 text-slate-500">
                    <Loader2 className="animate-spin mb-4 text-blue-600" size={40} />
                    <p className="font-medium">Cargando sucursales...</p>
                </div>
            ) : error ? (
                <div className="bg-red-50 border border-red-200 text-red-600 p-6 rounded-2xl flex flex-col items-center">
                    <p className="font-bold">Error al cargar datos</p>
                    <p className="text-sm mt-1">{error}</p>
                </div>
            ) : sucursalesSummary.length === 0 ? (
                <div className="bg-slate-50 border border-slate-200 text-slate-400 p-12 rounded-2xl flex flex-col items-center text-center">
                    <MapPin size={48} className="mb-4 opacity-20" />
                    <p className="font-medium">No se encontraron ventas en este periodo.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {/* Special Card: All Branches */}
                    {allBranchesSummary && (
                        <div 
                            onClick={() => {
                                setSelectedSucursal({ id: 'all', name: 'Todas las Sucursales' });
                                setIsSociosModalOpen(true);
                            }}
                            className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-6 shadow-xl hover:shadow-blue-200 hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden text-white"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full -mr-12 -mt-12 group-hover:bg-white/15 transition-colors"></div>
                            
                            <div className="flex flex-col h-full relative z-10">
                                <div className="flex items-start justify-between mb-6">
                                    <div className="p-3 bg-white/20 rounded-2xl">
                                        <LayoutGrid size={24} className="text-white" />
                                    </div>
                                    <div className="text-white/50 group-hover:text-white transition-colors">
                                        <ArrowUpRight size={24} />
                                    </div>
                                </div>

                                <h3 className="text-2xl font-black mb-2 truncate">
                                    Todas las Sucursales
                                </h3>

                                <div className="space-y-4 mt-auto">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-white/70">Venta Global</span>
                                        <span className="text-xl font-black">{formatCurrency(allBranchesSummary.TotalVenta)}</span>
                                    </div>
                                    
                                    <div className="h-px bg-white/10"></div>

                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Users size={16} className="text-white/70" />
                                            <span className="text-sm font-medium text-white/70">Total Clientes</span>
                                        </div>
                                        <span className="text-sm font-bold bg-white/20 px-2.5 py-1 rounded-lg">
                                            {allBranchesSummary.TotalClientes}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Branch Cards */}
                    {sucursalesSummary.map((suc) => (
                        <div 
                            key={suc.IdSucursal}
                            onClick={() => {
                                setSelectedSucursal({ id: suc.IdSucursal, name: suc.Nombre });
                                setIsSociosModalOpen(true);
                            }}
                            className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-xl hover:border-blue-500/30 transition-all cursor-pointer group relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-bl-full -mr-8 -mt-8 group-hover:bg-blue-500/10 transition-colors"></div>
                            
                            <div className="flex flex-col h-full">
                                <div className="flex items-start justify-between mb-6">
                                    <div className="p-3 bg-blue-50 rounded-2xl group-hover:bg-blue-600 transition-colors">
                                        <Store size={24} className="text-blue-600 group-hover:text-white transition-colors" />
                                    </div>
                                    <div className="text-slate-300 group-hover:text-blue-500 transition-colors">
                                        <ArrowUpRight size={24} />
                                    </div>
                                </div>

                                <h3 className="text-xl font-bold text-slate-800 mb-2 truncate group-hover:text-blue-600 transition-colors">
                                    {suc.Nombre}
                                </h3>

                                <div className="space-y-4 mt-auto">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-slate-400">Venta Total</span>
                                        <span className="text-lg font-bold text-slate-900">{formatCurrency(suc.TotalVenta)}</span>
                                    </div>
                                    
                                    <div className="h-px bg-slate-50"></div>

                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Users size={16} className="text-slate-400" />
                                            <span className="text-sm font-medium text-slate-400">Clientes</span>
                                        </div>
                                        <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                                            {suc.TotalClientes}
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-6 flex items-center justify-center gap-2 text-blue-600 text-xs font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                                    Ver Detalle <ChevronRight size={14} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* MODAL STACK */}
            
            {/* Level 1: Socios in Branch */}
            <SociosBySucursalModal 
                isOpen={isSociosModalOpen}
                onClose={() => setIsSociosModalOpen(false)}
                idSucursal={selectedSucursal?.id as any}
                sucursalName={selectedSucursal?.name || ''}
                startDate={startDate}
                endDate={endDate}
                onSocioClick={(socio) => {
                    setSelectedProfesor(socio);
                    setIsProfesorModalOpen(true);
                }}
            />

            {/* Level 2: Sales of Socio */}
            <ProfesorVentasDetailModal 
                isOpen={isProfesorModalOpen}
                onClose={() => setIsProfesorModalOpen(false)}
                idSocio={selectedProfesor?.id || null}
                socioName={selectedProfesor?.name || ''}
                startDate={startDate}
                endDate={endDate}
                sucursalId={String(selectedSucursal?.id || 'all')}
                onSaleClick={(sale) => {
                    setSelectedVenta(sale);
                    setIsVentaModalOpen(true);
                }}
            />

            {/* Level 3: Sale Items */}
            <VentasItemDetailModal 
                isOpen={isVentaModalOpen}
                onClose={() => setIsVentaModalOpen(false)}
                idVenta={selectedVenta?.id || null}
                idSucursal={selectedVenta?.sucursalId || null}
                folioVenta={selectedVenta?.folio || ''}
                clienteName={selectedProfesor?.name || ''}
            />
        </div>
    );
}

export default function ReporteProfesoresPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin text-blue-600" size={40} />
            </div>
        }>
            <ReportContent />
        </Suspense>
    );
}
