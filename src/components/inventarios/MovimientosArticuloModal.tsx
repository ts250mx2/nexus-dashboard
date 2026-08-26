'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, History, RefreshCcw, X } from 'lucide-react';
import DataTable, { Column, StatusPill } from '@/components/inventarios/DataTable';
import { colNumero, colTexto, exportarExcel } from '@/components/inventarios/export-excel';
import { ErrorState, LoadingState } from '@/components/inventarios/InventoryShell';
import { useInventoryReport } from '@/hooks/use-inventory-report';
import { formatDate, formatDateTime, formatDecimal, formatInt } from '@/lib/format';
import type { MovimientoRow, MovimientosResponse } from '@/lib/inventory/movimientos';
import {
    ResumenTipo,
    TIPO_CORTE,
    TIPO_TODOS,
    etiquetaTipo,
    filtrarPorTipo,
} from '@/lib/inventory/movimientos-view';
import { cn } from '@/lib/utils';

/**
 * Modal "Reporte de movimientos" de un artículo en una sucursal. Réplica de
 * frmRepMovimientos del ERP: resumen por tipo (clic para filtrar) y detalle
 * cronológico con saldo por renglón. Se abre al hacer clic en un artículo de la
 * pantalla de existencias.
 */

export interface ArticuloSeleccionado {
    IdArticulo: number;
    IdSucursal: number;
    Codigo: string;
    Descripcion: string;
    Sucursal: string;
}

interface Props {
    articulo: ArticuloSeleccionado;
    onClose: () => void;
}

type PillTone = 'rose' | 'amber' | 'emerald' | 'slate' | 'violet';

const TONO_TIPO: Readonly<Record<number, PillTone>> = {
    0: 'violet',
    1: 'rose',
    2: 'emerald',
    3: 'amber',
    4: 'emerald',
    5: 'emerald',
    6: 'violet',
    [TIPO_CORTE]: 'slate',
};

const BOTON_HEADER =
    'p-2.5 bg-white border border-slate-200 text-blue-600 hover:bg-slate-100 hover:border-slate-300 transition-all rounded-xl shadow-xs cursor-pointer flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

/** Elementos que reciben foco dentro del diálogo, para atrapar el Tab. */
const ENFOCABLES =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Cantidades enteras sin decimales; las fraccionarias con dos. */
function cantidad(value: unknown): string {
    const n = Number(value) || 0;
    return Number.isInteger(n) ? formatDecimal(n, 0) : formatDecimal(n, 2);
}

function Signo({ value }: { value: number }) {
    const n = Number(value || 0);
    if (n === 0) return <span className="text-slate-300">—</span>;
    return n > 0
        ? <span className="font-bold text-emerald-600">+{cantidad(n)}</span>
        : <span className="font-bold text-amber-600">−{cantidad(Math.abs(n))}</span>;
}

function Saldo({ value }: { value: number }) {
    const n = Number(value || 0);
    return (
        <span className={cn('font-black tabular-nums', n < 0 ? 'text-rose-600' : 'text-slate-900')}>
            {cantidad(n)}
        </span>
    );
}

const COLUMNAS: Column<MovimientoRow>[] = [
    {
        key: 'FechaMovimiento',
        label: 'Fecha movimiento',
        render: r => (
            <span className="whitespace-nowrap text-xs text-slate-600 inline-flex items-center gap-1.5">
                {formatDateTime(r.FechaMovimiento)}
                {r.Editado === 1 && (
                    <span
                        title={`Modificado: ${formatDateTime(r.FechaAct)}`}
                        className="px-1 rounded bg-amber-50 text-amber-700 border border-amber-100 text-[9px] font-black uppercase"
                    >
                        Editado
                    </span>
                )}
            </span>
        ),
        sortValue: r => Date.parse(r.FechaMovimiento) || 0,
    },
    {
        key: 'TipoMovimiento',
        label: 'Tipo',
        render: r => <StatusPill tone={TONO_TIPO[r.TipoMovimiento] ?? 'slate'}>{etiquetaTipo(r.TipoMovimiento)}</StatusPill>,
    },
    {
        key: 'Concepto',
        label: 'Concepto',
        render: r => (
            <span className={cn('text-slate-700', r.TipoMovimiento === TIPO_CORTE && 'font-black text-blue-700')}>
                {r.Concepto}
            </span>
        ),
    },
    { key: 'Mov', label: 'Mov', align: 'right', render: r => <Signo value={r.Mov} /> },
    { key: 'Exi', label: 'Exi', align: 'right', render: r => <Saldo value={r.Exi} /> },
    {
        key: 'Usuario',
        label: 'Usuario',
        render: r => (r.Usuario ? <span className="text-xs text-slate-600">{r.Usuario}</span> : <span className="text-slate-300">—</span>),
    },
];

/** Llave primaria del renglón en tblReporteMovimientos. */
const llaveMovimiento = (r: MovimientoRow) => `${r.IdComputadora}-${r.TipoMovimiento}-${r.Folio}-${r.Iteracion}`;

function Stat({
    label,
    value,
    hint,
    tone = 'slate',
}: {
    label: string;
    value: string;
    hint?: string;
    tone?: 'blue' | 'emerald' | 'rose' | 'slate' | 'amber';
}) {
    const color = {
        blue: 'text-blue-700',
        emerald: 'text-emerald-600',
        rose: 'text-rose-600',
        slate: 'text-slate-900',
        amber: 'text-amber-600',
    }[tone];
    return (
        <div className="bg-slate-50/70 border border-slate-100 rounded-xl px-4 py-3 min-w-0">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{label}</p>
            <p className={cn('text-xl font-black tabular-nums truncate', color)}>{value}</p>
            {hint && <p className="text-[10px] font-semibold text-slate-400 truncate">{hint}</p>}
        </div>
    );
}

function SeccionTitulo({ titulo, sub }: { titulo: string; sub: string }) {
    return (
        <div>
            <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">{titulo}</h3>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">{sub}</p>
        </div>
    );
}

const TH = 'py-2 px-3 text-[10px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap';
const TD = 'py-2 px-3 text-sm text-slate-700';

/**
 * Réplica de la rejilla superior del ERP: un renglón por tipo, clic para filtrar
 * el detalle. El botón de la primera celda es el control accesible (Tab + Enter);
 * su clic burbujea al renglón, así que hay un solo manejador.
 */
function ResumenTabla({
    resumen,
    activo,
    onSelect,
}: {
    resumen: ResumenTipo[];
    activo: number;
    onSelect: (tipo: number) => void;
}) {
    return (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full border-collapse">
                <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-left">
                        <th className={TH}>Tipo movimiento</th>
                        <th className={cn(TH, 'text-right')}>Folios</th>
                        <th className={cn(TH, 'text-right')}>Cant.</th>
                        <th className={cn(TH, 'text-right')}>Prom × folio</th>
                        <th className={cn(TH, 'text-right')}>Prom × día</th>
                        <th className={TH}>Primer folio</th>
                        <th className={TH}>Último folio</th>
                        <th className={cn(TH, 'text-right')}>Editados</th>
                    </tr>
                </thead>
                <tbody>
                    {resumen.map(r => {
                        const seleccionado = r.TipoMovimiento === activo;
                        return (
                            <tr
                                key={r.TipoMovimiento}
                                onClick={() => onSelect(r.TipoMovimiento)}
                                className={cn(
                                    'border-b border-slate-50 cursor-pointer transition-colors',
                                    seleccionado ? 'bg-blue-50/70' : 'hover:bg-slate-50/70'
                                )}
                            >
                                <td className={TD}>
                                    <button
                                        type="button"
                                        aria-current={seleccionado ? 'true' : undefined}
                                        className="inline-flex items-center gap-2 cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                    >
                                        <span className={cn('w-1 h-4 rounded', seleccionado ? 'bg-blue-600' : 'bg-transparent')} />
                                        <span className={cn('font-bold uppercase text-xs tracking-wider', seleccionado ? 'text-blue-700' : 'text-slate-700')}>
                                            {r.Etiqueta}
                                        </span>
                                    </button>
                                </td>
                                <td className={cn(TD, 'text-right tabular-nums font-semibold')}>{formatInt(r.Folios)}</td>
                                <td className={cn(TD, 'text-right tabular-nums')}><Signo value={r.Cantidad} /></td>
                                <td className={cn(TD, 'text-right tabular-nums')}>{r.PromFolio === null ? '—' : formatDecimal(r.PromFolio, 1)}</td>
                                <td className={cn(TD, 'text-right tabular-nums')}>{r.PromDia === null ? '—' : formatDecimal(r.PromDia, 1)}</td>
                                <td className={cn(TD, 'text-xs whitespace-nowrap')}>{formatDateTime(r.FechaMin)}</td>
                                <td className={cn(TD, 'text-xs whitespace-nowrap')}>{formatDateTime(r.FechaMax)}</td>
                                <td className={cn(TD, 'text-right tabular-nums')}>
                                    {r.Editados > 0
                                        ? <span className="font-bold text-amber-600">{formatInt(r.Editados)}</span>
                                        : <span className="text-slate-300">0</span>}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export default function MovimientosArticuloModal({ articulo, onClose }: Props) {
    const [verTodos, setVerTodos] = useState(false);
    const [tipo, setTipo] = useState<number>(TIPO_TODOS);
    const dialogoRef = useRef<HTMLDivElement>(null);
    // Solo cierra si el clic EMPEZÓ en el fondo: arrastrar una selección de texto
    // desde la tabla hasta fuera del diálogo dispara `click` en el fondo y no debe cerrar.
    const clicEnFondo = useRef(false);

    const { data, loading, refreshing, error, refresh } = useInventoryReport<MovimientosResponse>(
        '/api/inventarios/existencias/movimientos',
        { articulo: articulo.IdArticulo, sucursal: articulo.IdSucursal, todos: verTodos }
    );

    // Escape cierra; el fondo deja de desplazarse mientras el modal está abierto.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        const overflowPrevio = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = overflowPrevio;
        };
    }, [onClose]);

    // Foco: entra al diálogo al abrir y regresa al elemento que lo abrió al cerrar.
    useEffect(() => {
        const disparador = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialogoRef.current?.focus();
        return () => disparador?.focus();
    }, []);

    const atraparTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'Tab' || !dialogoRef.current) return;
        const enfocables = Array.from(dialogoRef.current.querySelectorAll<HTMLElement>(ENFOCABLES))
            .filter(el => el.offsetParent !== null);
        if (enfocables.length === 0) return;
        const primero = enfocables[0];
        const ultimo = enfocables[enfocables.length - 1];
        const activo = document.activeElement;
        if (e.shiftKey && (activo === primero || activo === dialogoRef.current)) {
            e.preventDefault();
            ultimo.focus();
        } else if (!e.shiftKey && activo === ultimo) {
            e.preventDefault();
            primero.focus();
        }
    };

    const movimientos = useMemo(() => data?.movimientos ?? [], [data]);
    const resumen = useMemo(() => data?.resumen ?? [], [data]);
    // Si el tipo elegido deja de existir (p. ej. al cambiar "Ver todos") se vuelve a TODOS.
    const tipoActivo = resumen.some(r => r.TipoMovimiento === tipo) ? tipo : TIPO_TODOS;
    const visibles = useMemo(() => filtrarPorTipo(movimientos, tipoActivo), [movimientos, tipoActivo]);

    const meta = data?.meta;
    const codigo = meta?.Codigo ?? articulo.Codigo;
    const descripcion = meta?.Descripcion ?? articulo.Descripcion;
    const sucursal = meta?.Sucursal ?? articulo.Sucursal;
    const todos = resumen.find(r => r.TipoMovimiento === TIPO_TODOS);
    const ocupado = loading || refreshing;

    const handleExport = () => {
        if (!meta) return;
        const filas = [...visibles]
            .sort((a, b) => (Date.parse(a.FechaMovimiento) || 0) - (Date.parse(b.FechaMovimiento) || 0))
            .map(r => ({
                ...r,
                FechaTexto: formatDateTime(r.FechaMovimiento),
                Tipo: etiquetaTipo(r.TipoMovimiento),
                Usuario: r.Usuario ?? '',
                EditadoTexto: r.Editado ? 'Sí' : '',
            }));
        exportarExcel({
            archivo: `movimientos_${codigo}_${sucursal}`,
            hoja: 'Movimientos',
            titulo: 'MOVIMIENTOS DE INVENTARIO',
            meta: [
                { label: 'Código', value: codigo },
                { label: 'Descripción', value: descripcion },
                { label: 'Sucursal', value: sucursal },
                { label: 'Existencia actual', value: cantidad(meta.exiFinal) },
                { label: 'Tipo', value: etiquetaTipo(tipoActivo) },
                { label: 'Ver todos', value: verTodos ? 'Sí' : 'No' },
            ],
            columnas: [
                colTexto('Fecha', 'FechaTexto', 20),
                colTexto('Tipo', 'Tipo', 20),
                colTexto('Concepto', 'Concepto', 50),
                colNumero('Mov', 'Mov', 10),
                colNumero('Exi', 'Exi', 10),
                colTexto('Usuario', 'Usuario', 24),
                colTexto('Editado', 'EditadoTexto', 10),
            ],
            filas,
        });
    };

    return (
        <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-3 md:p-6 animate-in fade-in duration-200"
            onMouseDown={e => { clicEnFondo.current = e.target === e.currentTarget; }}
            onClick={e => {
                if (clicEnFondo.current && e.target === e.currentTarget) onClose();
            }}
        >
            <div
                ref={dialogoRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="titulo-movimientos"
                tabIndex={-1}
                onKeyDown={atraparTab}
                className="bg-white w-full max-w-6xl h-full max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 focus:outline-none"
            >
                <header className="flex flex-wrap items-start justify-between gap-4 px-6 py-4 border-b border-slate-100 bg-slate-50/60">
                    <div className="min-w-0">
                        <h2
                            id="titulo-movimientos"
                            className="text-base font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2.5"
                        >
                            <span className="p-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl">
                                <History size={18} strokeWidth={2.2} />
                            </span>
                            Reporte de movimientos
                        </h2>
                        <p className="mt-1.5 text-sm font-bold text-slate-800 truncate">{descripcion}</p>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider flex flex-wrap items-center gap-x-2">
                            <span>Código <span className="font-mono text-blue-700">{codigo}</span></span>
                            <span className="w-1 h-1 rounded-full bg-slate-300" />
                            <span>Sucursal <span className="text-slate-600">{sucursal}</span></span>
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap px-3 py-2 rounded-xl border border-slate-200 bg-white">
                            <input
                                type="checkbox"
                                checked={verTodos}
                                onChange={e => setVerTodos(e.target.checked)}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            Ver todos
                        </label>
                        <button
                            type="button"
                            onClick={handleExport}
                            disabled={visibles.length === 0}
                            title="Exportar a Excel"
                            aria-label="Exportar a Excel"
                            className={BOTON_HEADER}
                        >
                            <FileSpreadsheet size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={refresh}
                            disabled={ocupado}
                            title="Actualizar"
                            aria-label="Actualizar"
                            className={BOTON_HEADER}
                        >
                            <RefreshCcw size={16} className={cn(ocupado && 'animate-spin')} />
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            title="Cerrar"
                            aria-label="Cerrar"
                            className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-xl transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                    {error && <ErrorState message={error} onRetry={refresh} />}

                    {loading && !error && <LoadingState message="Cargando movimientos..." />}

                    {meta && !loading && !error && (
                        <>
                            {meta.truncado && (
                                <p className="px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-100 text-xs font-semibold text-amber-800">
                                    La historia de este artículo es muy larga: se muestran solo los{' '}
                                    {formatInt(movimientos.length)} movimientos más recientes. El saldo por renglón sigue
                                    siendo correcto; el resumen no incluye lo recortado.
                                </p>
                            )}

                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                                <Stat
                                    label="Existencia actual"
                                    value={cantidad(meta.exiFinal)}
                                    hint="Corte + movimientos posteriores"
                                    tone={meta.exiFinal < 0 ? 'rose' : 'emerald'}
                                />
                                <Stat
                                    label="Corte tipo 99"
                                    value={meta.ExiCorte === null ? '—' : cantidad(meta.ExiCorte)}
                                    hint={meta.FechaCorte ? `Inventario al ${formatDate(meta.FechaCorte)}` : 'Sin corte; respaldo de costo'}
                                    tone="blue"
                                />
                                <Stat
                                    label="Movimientos"
                                    value={formatInt(todos?.Folios ?? 0)}
                                    hint={
                                        todos?.FechaMin
                                            ? `Desde ${formatDate(todos.FechaMin)}`
                                            : verTodos ? 'Sin movimientos' : 'Nada después del último ajuste'
                                    }
                                />
                                <Stat
                                    label="Editados"
                                    value={formatInt(todos?.Editados ?? 0)}
                                    hint="Modificados en un día distinto"
                                    tone={(todos?.Editados ?? 0) > 0 ? 'amber' : 'slate'}
                                />
                            </div>

                            <section className="space-y-2">
                                <SeccionTitulo titulo="Resumen por tipo" sub="Clic en un renglón para filtrar el detalle" />
                                {resumen.length === 0 ? (
                                    <p className="py-6 text-center text-sm font-semibold text-slate-400">
                                        {verTodos
                                            ? 'El artículo no tiene movimientos en esta sucursal.'
                                            : 'Sin movimientos después del último ajuste físico. Activa "Ver todos" para la historia completa.'}
                                    </p>
                                ) : (
                                    <ResumenTabla resumen={resumen} activo={tipoActivo} onSelect={setTipo} />
                                )}
                            </section>

                            <section className="space-y-2">
                                <SeccionTitulo
                                    titulo={`Detalle · ${etiquetaTipo(tipoActivo)}`}
                                    sub={`${formatInt(visibles.length)} renglones · Exi = existencia después del movimiento`}
                                />
                                <DataTable
                                    columns={COLUMNAS}
                                    rows={visibles}
                                    rowKey={llaveMovimiento}
                                    initialSort={{ key: 'FechaMovimiento', direction: 'desc' }}
                                    rowClassName={r => (r.TipoMovimiento === TIPO_CORTE ? 'bg-blue-50/60' : '')}
                                    emptyMessage="No hay renglones para este tipo de movimiento."
                                />
                            </section>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
