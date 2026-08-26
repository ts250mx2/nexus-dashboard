'use client';

import React, { useMemo, useState } from 'react';
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Tabla ordenable y paginada del lado del cliente.
 * Los datos ya vienen filtrados y acotados por el endpoint; aquí solo se ordena,
 * se pagina y se pinta.
 */

// Un solo comparador para toda la app: `localeCompare` con locale resuelve
// los datos de Intl en cada llamada y triplica el costo de ordenar 18k filas.
const collator = new Intl.Collator('es-MX');

export interface Column<T> {
    key: string;
    label: string;
    align?: 'left' | 'right' | 'center';
    /** Cómo pintar la celda. Por defecto se muestra el valor tal cual. */
    render?: (row: T) => React.ReactNode;
    /** Valor usado para ordenar. Por defecto row[key]. */
    sortValue?: (row: T) => number | string;
    sortable?: boolean;
    className?: string;
}

interface DataTableProps<T> {
    columns: Column<T>[];
    rows: T[];
    rowKey: (row: T, index: number) => string;
    initialSort?: { key: string; direction: 'asc' | 'desc' };
    pageSize?: number;
    emptyMessage?: string;
    /** Resalta la fila completa, por ejemplo por severidad. */
    rowClassName?: (row: T) => string;
    /** Vuelve las filas clicables, por ejemplo para abrir un detalle. */
    onRowClick?: (row: T) => void;
}

export default function DataTable<T>({
    columns,
    rows,
    rowKey,
    initialSort,
    pageSize = 50,
    emptyMessage = 'No hay registros que cumplan el criterio.',
    rowClassName,
    onRowClick,
}: DataTableProps<T>) {
    const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(initialSort ?? null);
    const [page, setPage] = useState(1);

    const sorted = useMemo(() => {
        if (!sort) return rows;
        const column = columns.find(c => c.key === sort.key);
        const getValue = (row: T): number | string | undefined =>
            column?.sortValue
                ? column.sortValue(row)
                : (row as Record<string, unknown>)[sort.key] as number | string | undefined;

        return [...rows].sort((a, b) => {
            const va = getValue(a);
            const vb = getValue(b);
            const dir = sort.direction === 'asc' ? 1 : -1;

            if (typeof va === 'string' || typeof vb === 'string') {
                return collator.compare(String(va ?? ''), String(vb ?? '')) * dir;
            }
            return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
        });
    }, [rows, sort, columns]);

    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const pageRows = useMemo(
        () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
        [sorted, safePage, pageSize]
    );

    const toggleSort = (key: string) => {
        setPage(1);
        setSort(prev =>
            prev?.key === key
                ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
                : { key, direction: 'desc' }
        );
    };

    if (rows.length === 0) {
        return (
            <div className="py-12 text-center">
                <p className="text-sm font-semibold text-slate-400">{emptyMessage}</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="border-b border-slate-200">
                            {columns.map(col => {
                                const sortable = col.sortable !== false;
                                const activa = sort?.key === col.key;
                                const contenido = (
                                    <>
                                        {col.label}
                                        {sortable && (
                                            <ArrowUpDown size={11} className={cn(activa ? 'text-blue-600' : 'text-slate-300')} />
                                        )}
                                    </>
                                );
                                const claseContenido = cn('inline-flex items-center gap-1', col.align === 'right' && 'flex-row-reverse');
                                return (
                                    <th
                                        key={col.key}
                                        aria-sort={activa ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                                        className={cn(
                                            'py-2.5 px-3 text-[10px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap',
                                            col.align === 'right' && 'text-right',
                                            col.align === 'center' && 'text-center',
                                            !col.align && 'text-left'
                                        )}
                                    >
                                        {sortable ? (
                                            // Botón real: ordenable también con teclado (Tab + Enter).
                                            <button
                                                type="button"
                                                onClick={() => toggleSort(col.key)}
                                                className={cn(
                                                    claseContenido,
                                                    'uppercase tracking-wider cursor-pointer select-none hover:text-slate-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
                                                )}
                                            >
                                                {contenido}
                                            </button>
                                        ) : (
                                            <span className={claseContenido}>{contenido}</span>
                                        )}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {pageRows.map((row, i) => (
                            <tr
                                key={rowKey(row, i)}
                                onClick={onRowClick ? () => onRowClick(row) : undefined}
                                // Fila enfocable para que el detalle también se abra con teclado.
                                tabIndex={onRowClick ? 0 : undefined}
                                onKeyDown={onRowClick ? e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        onRowClick(row);
                                    }
                                } : undefined}
                                className={cn(
                                    'border-b border-slate-50 hover:bg-slate-50/70 transition-colors',
                                    onRowClick && 'cursor-pointer focus:outline-none focus-visible:bg-blue-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
                                    rowClassName?.(row)
                                )}
                            >
                                {columns.map(col => (
                                    <td
                                        key={col.key}
                                        className={cn(
                                            'py-2.5 px-3 text-slate-700',
                                            col.align === 'right' && 'text-right tabular-nums',
                                            col.align === 'center' && 'text-center',
                                            col.className
                                        )}
                                    >
                                        {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                    <p className="text-[11px] font-semibold text-slate-400">
                        Mostrando <span className="text-slate-700 font-bold">{(safePage - 1) * pageSize + 1}</span>
                        {' – '}
                        <span className="text-slate-700 font-bold">{Math.min(safePage * pageSize, sorted.length)}</span>
                        {' de '}
                        <span className="text-slate-700 font-bold">{sorted.length.toLocaleString('es-MX')}</span>
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={safePage === 1}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                            title="Página anterior"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                            {safePage} / {totalPages}
                        </span>
                        <button
                            type="button"
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={safePage === totalPages}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                            title="Página siguiente"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

/** Etiqueta de estado con color semántico. */
export function StatusPill({ tone, children }: { tone: 'rose' | 'amber' | 'emerald' | 'slate' | 'violet'; children: React.ReactNode }) {
    const tones = {
        rose: 'bg-rose-50 text-rose-700 border-rose-200',
        amber: 'bg-amber-50 text-amber-700 border-amber-200',
        emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        slate: 'bg-slate-100 text-slate-600 border-slate-200',
        violet: 'bg-violet-50 text-violet-700 border-violet-200',
    };
    return (
        <span className={cn('inline-block px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-wider whitespace-nowrap', tones[tone])}>
            {children}
        </span>
    );
}
