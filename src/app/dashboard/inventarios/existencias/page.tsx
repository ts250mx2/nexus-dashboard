'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
    AlertOctagon,
    AlertTriangle,
    ArrowDownToLine,
    ArrowUpFromLine,
    Boxes,
    Building2,
    PackageSearch,
    Wallet,
} from 'lucide-react';
import DataTable, { Column } from '@/components/inventarios/DataTable';
import InventoryFilters, { useSucursales } from '@/components/inventarios/InventoryFilters';
import MovimientosArticuloModal, { ArticuloSeleccionado } from '@/components/inventarios/MovimientosArticuloModal';
import {
    ErrorState,
    InventoryHeader,
    KpiCard,
    LoadingState,
    Panel,
} from '@/components/inventarios/InventoryShell';
import {
    colMoneda,
    colNumero,
    colTexto,
    exportarExcel,
} from '@/components/inventarios/export-excel';
import { useInventoryReport } from '@/hooks/use-inventory-report';
import type { ExistenciaRow } from '@/lib/inventory/existencias';
import { armarVista, tieneMovimientoHoy, totalizar } from '@/lib/inventory/existencias-view';
import {
    formatCurrency,
    formatCurrencyShort,
    formatDate,
    formatDateTime,
    formatDecimal,
    formatInt,
} from '@/lib/format';

interface ExistenciasResponse {
    rows: ExistenciaRow[];
    meta: {
        sucursal: number | null;
        requiereSucursal: boolean;
        fechaCorte: string | null;
        generadoEn: string | null;
        ultimoMovimiento: string | null;
        calculadoEn: string;
    };
}

/** Aviso cuando el filtro "hoy" no encuentra nada: los documentos del día se consultan en vivo. */
function AvisoSinMovimientosHoy({ sucursal, generadoEn, calculadoEn }: {
    sucursal: string;
    generadoEn: string | null;
    calculadoEn: string;
}) {
    return (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-1">
                <p className="font-bold uppercase tracking-wider">Ningún artículo con movimientos hoy</p>
                <p>
                    Ventas, recibos, traspasos, devoluciones y consignaciones de {sucursal || 'la sucursal'} se
                    consultaron en vivo a las <span className="font-bold">{formatDateTime(calculadoEn)}</span> y no hay
                    documentos con fecha de hoy. La existencia inicial es el corte del ERP generado el{' '}
                    <span className="font-bold">{formatDateTime(generadoEn)}</span>. Pulsa actualizar para volver a consultar.
                </p>
            </div>
        </div>
    );
}

/** Cantidad con signo visual: negativos en rojo, ceros atenuados. */
function Cantidad({ value, strong = false }: { value: number; strong?: boolean }) {
    const n = Number(value || 0);
    if (n === 0) return <span className="text-slate-300">0</span>;
    const tone = n < 0 ? 'text-rose-600 font-black' : strong ? 'text-slate-900 font-black' : 'text-slate-700 font-semibold';
    return <span className={tone}>{formatDecimal(n, 0)}</span>;
}

function Movimiento({ value, tone }: { value: number; tone: 'entrada' | 'salida' }) {
    const n = Number(value || 0);
    if (n <= 0) return <span className="text-slate-300">—</span>;
    return tone === 'entrada'
        ? <span className="font-bold text-emerald-600">+{formatDecimal(n, 0)}</span>
        : <span className="font-bold text-amber-600">−{formatDecimal(n, 0)}</span>;
}

const COLUMNS: Column<ExistenciaRow>[] = [
    {
        key: 'Codigo',
        label: 'Código',
        render: r => <span className="font-mono text-xs font-bold text-blue-700 whitespace-nowrap">{r.Codigo}</span>,
    },
    {
        key: 'Descripcion',
        label: 'Descripción',
        render: r => (
            <div className="min-w-[240px]">
                <p className="font-bold text-slate-800 leading-tight">{r.Descripcion}</p>
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex flex-wrap items-center gap-x-2">
                    <span>{r.Marca} · {r.Depto}</span>
                    {tieneMovimientoHoy(r) && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-px rounded bg-blue-50 text-blue-700 border border-blue-100 normal-case tracking-normal">
                            Hoy
                            {Number(r.EntradasHoy) > 0 && <span className="text-emerald-600">+{formatDecimal(r.EntradasHoy, 0)}</span>}
                            {Number(r.SalidasHoy) > 0 && <span className="text-amber-600">−{formatDecimal(r.SalidasHoy, 0)}</span>}
                        </span>
                    )}
                </p>
            </div>
        ),
    },
    { key: 'ExiInicial', label: 'Exi. inicial', align: 'right', render: r => <Cantidad value={r.ExiInicial} /> },
    { key: 'Entradas', label: 'Entradas', align: 'right', render: r => <Movimiento value={r.Entradas} tone="entrada" /> },
    { key: 'Salidas', label: 'Salidas', align: 'right', render: r => <Movimiento value={r.Salidas} tone="salida" /> },
    { key: 'ExiFinal', label: 'Exi. final', align: 'right', render: r => <Cantidad value={r.ExiFinal} strong /> },
    { key: 'Costo', label: 'Costo', align: 'right', render: r => <span className="text-slate-600">{formatCurrency(r.Costo)}</span> },
    {
        key: 'Total',
        label: 'Total',
        align: 'right',
        render: r => <span className={Number(r.Total) < 0 ? 'font-black text-rose-600' : 'font-bold text-slate-800'}>{formatCurrency(r.Total)}</span>,
    },
    {
        key: 'Consignacion',
        label: 'Consignación',
        align: 'right',
        render: r => (Number(r.Consignacion) !== 0 ? <span className="font-semibold text-violet-600">{formatDecimal(r.Consignacion, 0)}</span> : <span className="text-slate-300">—</span>),
    },
    {
        key: 'UltimaActualizacion',
        label: 'Última actualización',
        align: 'right',
        render: r => <span className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(r.UltimaActualizacion)}</span>,
        sortValue: r => (r.UltimaActualizacion ? new Date(r.UltimaActualizacion).getTime() : 0),
    },
];

export default function ExistenciasPage() {
    const sucursales = useSucursales();
    const [sucursal, setSucursal] = useState('');
    const [search, setSearch] = useState('');
    const [ocultarSinMovimiento, setOcultarSinMovimiento] = useState(false);
    const [soloMovimientosHoy, setSoloMovimientosHoy] = useState(false);
    const [soloNegativos, setSoloNegativos] = useState(false);
    // Artículo abierto en el modal de movimientos (clic en una fila), como el doble clic del ERP.
    const [articuloAbierto, setArticuloAbierto] = useState<ArticuloSeleccionado | null>(null);
    const cerrarMovimientos = useCallback(() => setArticuloAbierto(null), []);

    // La sucursal se elige explícitamente: cada consulta cuesta 3-5 s y MySQL no
    // la cancela aunque el cliente aborte, así que no se dispara ninguna que el
    // usuario no haya pedido (por ejemplo, la primera del catálogo por omisión).
    const sucursalNombre = sucursales.find(s => String(s.IdSucursal) === sucursal)?.Sucursal ?? '';

    const { data, loading, refreshing, error, lastUpdated, refresh } = useInventoryReport<ExistenciasResponse>(
        '/api/inventarios/existencias',
        { sucursal }
    );

    const rows = useMemo(() => data?.rows ?? [], [data]);
    // Mientras llega la sucursal recién elegida, el hook conserva los datos de la
    // anterior. Todas las etiquetas que acompañan a los datos salen de `data`, no
    // de la selección, para no cruzar nombres y cifras.
    const sucursalDatos = sucursales.find(s => s.IdSucursal === data?.meta.sucursal)?.Sucursal ?? '';
    const viewRows = useMemo(
        () => armarVista(rows, search, { ocultarSinMovimiento, soloMovimientosHoy, soloNegativos }),
        [rows, search, ocultarSinMovimiento, soloMovimientosHoy, soloNegativos]
    );
    const totales = useMemo(() => totalizar(viewRows), [viewRows]);

    const requiereSucursal = !data || data.meta.requiereSucursal;
    const hayFiltro = viewRows.length !== rows.length;
    const articulosConMovimientoHoy = useMemo(() => rows.filter(tieneMovimientoHoy).length, [rows]);
    const avisarSinHoy = soloMovimientosHoy && rows.length > 0 && articulosConMovimientoHoy === 0;

    const handleExport = () => {
        if (!data || refreshing) return;
        exportarExcel({
            archivo: `existencias_${sucursalDatos || data.meta.sucursal}`,
            hoja: 'Existencias',
            titulo: 'Existencia de Artículos',
            meta: [
                { label: 'Sucursal', value: sucursalDatos || `#${data.meta.sucursal}` },
                { label: 'Corte (tipo 99)', value: formatDate(data.meta.fechaCorte) },
                { label: 'Filtro', value: search.trim() || 'Sin filtro' },
                { label: 'Solo con movimientos hoy', value: soloMovimientosHoy ? 'Sí' : 'No' },
                { label: 'Solo en negativo', value: soloNegativos ? 'Sí' : 'No' },
                { label: 'Existencia final', value: formatInt(totales.exiFinal) },
                { label: 'Valor a costo', value: formatCurrency(totales.total) },
            ],
            columnas: [
                colTexto('Código', 'Codigo', 14),
                colTexto('Descripción', 'Descripcion', 44),
                colTexto('Marca', 'Marca', 16),
                colTexto('Departamento', 'Depto', 18),
                colNumero('Exi. inicial', 'ExiInicial'),
                colNumero('Entradas', 'Entradas'),
                colNumero('Salidas', 'Salidas'),
                colNumero('Entradas hoy', 'EntradasHoy', 14),
                colNumero('Salidas hoy', 'SalidasHoy', 14),
                colNumero('Exi. final', 'ExiFinal'),
                colMoneda('Costo', 'Costo', 14),
                colMoneda('Total', 'Total'),
                colNumero('Consignación', 'Consignacion', 14),
                colTexto('Última actualización', 'UltimaTexto', 22),
            ],
            filas: viewRows.map(r => ({ ...r, UltimaTexto: formatDateTime(r.UltimaActualizacion) })),
            totales: {
                label: 'TOTAL',
                values: {
                    ExiInicial: totales.exiInicial,
                    Entradas: totales.entradas,
                    Salidas: totales.salidas,
                    EntradasHoy: totales.entradasHoy,
                    SalidasHoy: totales.salidasHoy,
                    ExiFinal: totales.exiFinal,
                    Total: totales.total,
                },
            },
        });
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <InventoryHeader
                title="Existencia de Artículos"
                icon={PackageSearch}
                badge={
                    refreshing && sucursalNombre
                        ? `Cargando ${sucursalNombre}…`
                        : sucursalDatos || 'Corte del ERP + movimientos en vivo'
                }
                lastUpdated={lastUpdated}
                loading={loading || refreshing}
                onRefresh={refresh}
            />

            <InventoryFilters
                sucursales={sucursales}
                selectionMode="single"
                selectedSucursales={sucursal ? [sucursal] : []}
                onSucursalesChange={ids => setSucursal(ids[0] ?? '')}
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder='Filtrar: código, descripción o marca (ej. "cinta morad")'
                onExport={handleExport}
                exportDisabled={viewRows.length === 0 || refreshing}
            >
                <div className="flex flex-col gap-1.5 pb-1.5">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap">
                        <input
                            type="checkbox"
                            checked={soloMovimientosHoy}
                            onChange={e => setSoloMovimientosHoy(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        Solo con movimientos hoy
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap">
                        <input
                            type="checkbox"
                            checked={soloNegativos}
                            onChange={e => setSoloNegativos(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                        />
                        Solo en negativo
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap">
                        <input
                            type="checkbox"
                            checked={ocultarSinMovimiento}
                            onChange={e => setOcultarSinMovimiento(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        Ocultar en cero
                    </label>
                </div>
            </InventoryFilters>

            {error && <ErrorState message={error} onRetry={refresh} />}

            {loading && !error && (
                <LoadingState message={`Calculando existencias de ${sucursalNombre || 'la sucursal'}...`} />
            )}

            {!loading && !error && requiereSucursal && (
                <div className="flex flex-col items-center justify-center py-20 gap-3 bg-white rounded-2xl border border-slate-100 shadow-xs">
                    <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                        <Building2 size={26} />
                    </div>
                    <p className="text-sm font-bold text-slate-700 uppercase tracking-wider">Selecciona una sucursal</p>
                    <p className="text-xs text-slate-400 max-w-md text-center">
                        La existencia se calcula sucursal por sucursal a partir del corte tipo 99 y los
                        movimientos posteriores.
                    </p>
                </div>
            )}

            {data && !loading && !error && !requiereSucursal && (
                <>
                    {avisarSinHoy && (
                        <AvisoSinMovimientosHoy
                            sucursal={sucursalDatos}
                            generadoEn={data.meta.generadoEn}
                            calculadoEn={data.meta.calculadoEn}
                        />
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
                        <KpiCard
                            label="Artículos"
                            value={formatInt(totales.registros)}
                            hint={hayFiltro ? `de ${formatInt(rows.length)} en ${sucursalDatos}` : `${formatInt(totales.conExistencia)} con existencia`}
                            icon={Boxes}
                            tone="blue"
                        />
                        <KpiCard
                            label="Con movimiento hoy"
                            value={formatInt(totales.conMovimientoHoy)}
                            hint={
                                totales.conMovimientoHoy > 0
                                    ? `Entradas hoy ${formatInt(totales.entradasHoy)} · salidas hoy ${formatInt(totales.salidasHoy)}`
                                    : `Sin documentos de hoy (consultado en vivo ${formatDateTime(data.meta.calculadoEn)})`
                            }
                            icon={totales.entradasHoy >= totales.salidasHoy ? ArrowDownToLine : ArrowUpFromLine}
                            tone="violet"
                            onClick={() => setSoloMovimientosHoy(v => !v)}
                        />
                        <KpiCard
                            label="Existencia final"
                            value={formatInt(totales.exiFinal)}
                            hint={`Inicial ${formatInt(totales.exiInicial)} · entradas ${formatInt(totales.entradas)} · salidas ${formatInt(totales.salidas)}`}
                            icon={Boxes}
                            tone="emerald"
                        />
                        <KpiCard
                            label="Valor a costo"
                            value={formatCurrencyShort(totales.total)}
                            hint="Existencia final × costo"
                            icon={Wallet}
                            tone="slate"
                        />
                        <KpiCard
                            label="En negativo"
                            value={formatInt(totales.negativos)}
                            hint={soloNegativos ? 'Mostrando solo negativos · clic para quitar' : 'Existencia final menor que cero · clic para filtrar'}
                            icon={AlertOctagon}
                            tone={totales.negativos > 0 || soloNegativos ? 'rose' : 'slate'}
                            onClick={() => setSoloNegativos(v => !v)}
                        />
                    </div>

                    <Panel
                        title={`Existencias · ${sucursalDatos}`}
                        subtitle={`Existencia inicial = corte del ERP del ${formatDate(data.meta.fechaCorte)} (generado ${formatDateTime(data.meta.generadoEn)}) · entradas y salidas posteriores leídas en vivo a las ${formatDateTime(data.meta.calculadoEn)}`}
                        action={
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {formatInt(viewRows.length)} registros · clic en un artículo para ver sus movimientos
                            </span>
                        }
                    >
                        <DataTable
                            // Cada cambio de filtro remonta la tabla para volver a la página 1;
                            // si no, el usuario aterriza en una página intermedia del resultado.
                            key={`${data.meta.sucursal}|${search}|${ocultarSinMovimiento}|${soloMovimientosHoy}|${soloNegativos}`}
                            columns={COLUMNS}
                            rows={viewRows}
                            rowKey={r => String(r.IdArticulo)}
                            initialSort={{ key: 'Descripcion', direction: 'asc' }}
                            rowClassName={r => (Number(r.ExiFinal) < 0 ? 'bg-rose-50/40' : '')}
                            onRowClick={r => setArticuloAbierto({
                                IdArticulo: r.IdArticulo,
                                IdSucursal: r.IdSucursal,
                                Codigo: r.Codigo,
                                Descripcion: r.Descripcion,
                                Sucursal: r.Sucursal,
                            })}
                            emptyMessage={
                                hayFiltro
                                    ? 'Ningún artículo coincide con el filtro.'
                                    : 'La sucursal no tiene artículos activos con inventario registrado.'
                            }
                        />
                    </Panel>
                </>
            )}

            {articuloAbierto && (
                <MovimientosArticuloModal articulo={articuloAbierto} onClose={cerrarMovimientos} />
            )}
        </div>
    );
}
