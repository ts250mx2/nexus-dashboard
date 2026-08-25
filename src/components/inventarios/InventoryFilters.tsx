'use client';

import React, { useEffect, useState } from 'react';
import { Download, Search, SlidersHorizontal, X } from 'lucide-react';
import MultiSelect from '@/components/MultiSelect';

/**
 * Barra de filtros común a los tableros de inventario:
 * sucursales, ventana de demanda, búsqueda y exportación.
 */

export interface SucursalOption {
    IdSucursal: number;
    Sucursal: string;
}

/** Ventanas de historia disponibles para estimar la demanda. */
export const VENTANAS_DEMANDA = [
    { value: 30, label: '30 días' },
    { value: 60, label: '60 días' },
    { value: 90, label: '90 días' },
    { value: 180, label: '180 días' },
    { value: 365, label: '1 año' },
];

/** Carga el catálogo de sucursales que participan en los reportes de inventario. */
export function useSucursales(): SucursalOption[] {
    const [sucursales, setSucursales] = useState<SucursalOption[]>([]);

    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/inventarios/sucursales', { signal: controller.signal })
            .then(r => r.json())
            .then(json => {
                if (json.success) setSucursales(json.data);
            })
            .catch(() => { /* el filtro simplemente queda vacío */ });
        return () => controller.abort();
    }, []);

    return sucursales;
}

interface InventoryFiltersProps {
    sucursales: SucursalOption[];
    selectedSucursales: string[];
    onSucursalesChange: (ids: string[]) => void;
    dias: number;
    onDiasChange: (dias: number) => void;
    search: string;
    onSearchChange: (value: string) => void;
    onExport?: () => void;
    exportDisabled?: boolean;
    /** Controles propios de cada módulo (umbrales, interruptores). */
    children?: React.ReactNode;
}

export default function InventoryFilters({
    sucursales,
    selectedSucursales,
    onSucursalesChange,
    dias,
    onDiasChange,
    search,
    onSearchChange,
    onExport,
    exportDisabled = false,
    children,
}: InventoryFiltersProps) {
    return (
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="flex-1 min-w-[200px]">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">
                    Sucursales
                </label>
                <MultiSelect
                    options={sucursales.map(s => ({ id: String(s.IdSucursal), name: s.Sucursal }))}
                    selected={selectedSucursales}
                    onChange={onSucursalesChange}
                    placeholder="Todas las sucursales"
                    searchable
                />
            </div>

            <div className="w-full lg:w-40">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">
                    Historia de demanda
                </label>
                <select
                    value={dias}
                    onChange={e => onDiasChange(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    {VENTANAS_DEMANDA.map(v => (
                        <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                </select>
            </div>

            {children}

            <div className="flex-1 min-w-[180px]">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">
                    Buscar artículo
                </label>
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => onSearchChange(e.target.value)}
                        placeholder="Producto, código o marca"
                        className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => onSearchChange('')}
                            title="Limpiar búsqueda"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {onExport && (
                <button
                    type="button"
                    onClick={onExport}
                    disabled={exportDisabled}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                    <Download size={14} />
                    Excel
                </button>
            )}
        </div>
    );
}

/** Control numérico compacto para los umbrales propios de cada módulo. */
export function ThresholdInput({ label, value, onChange, suffix = 'días', min = 1, max = 3650 }: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    suffix?: string;
    min?: number;
    max?: number;
}) {
    return (
        <div className="w-full lg:w-40">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <SlidersHorizontal size={11} />
                {label}
            </label>
            <div className="relative">
                <input
                    type="number"
                    min={min}
                    max={max}
                    value={value}
                    onChange={e => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n)) onChange(Math.min(Math.max(Math.trunc(n), min), max));
                    }}
                    className="w-full pl-3 pr-12 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase pointer-events-none">
                    {suffix}
                </span>
            </div>
        </div>
    );
}
