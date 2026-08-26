'use client';

import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarCheck, CheckCircle2, History, Save, ShieldCheck, XCircle } from 'lucide-react';
import DataTable, { Column, StatusPill } from '@/components/inventarios/DataTable';
import InventoryFilters, { useSucursales } from '@/components/inventarios/InventoryFilters';
import {
    ErrorState,
    InventoryHeader,
    KpiCard,
    LoadingState,
    Panel,
} from '@/components/inventarios/InventoryShell';
import { useInventoryReport } from '@/hooks/use-inventory-report';
import { getErrorMessage } from '@/lib/errors';
import type { CierreListado, ComparacionConHoy } from '@/lib/inventory/cierres';
import {
    CeldaComparacion,
    FilaComparacion,
    filtrarComparacion,
} from '@/lib/inventory/cierres-comparar';
import {
    formatCurrency,
    formatCurrencyShort,
    formatDate,
    formatDateTime,
    formatDecimal,
    formatInt,
} from '@/lib/format';

interface ListaResponse {
    retencionDias: number;
    data: CierreListado[];
}

interface ComparacionResponse {
    requiereSucursal: boolean;
    data: ComparacionConHoy | null;
}

/** Existencia con la verificación de la transición desde la columna anterior. */
function Verificada({ valor, celda, primera = false }: { valor: number | null; celda: CeldaComparacion; primera?: boolean }) {
    if (valor === null) return <span className="text-slate-300">—</span>;
    const n = Number(valor);
    const cifra = (
        <span className={n < 0 ? 'text-rose-600 font-black' : n === 0 ? 'text-slate-300' : 'font-semibold text-slate-800'}>
            {formatDecimal(n, 0)}
        </span>
    );
    if (primera) return cifra;

    const pill = {
        cuadra: <StatusPill tone="emerald">✔</StatusPill>,
        diferencia: <StatusPill tone="rose">{celda.diferencia !== null && celda.diferencia > 0 ? '+' : ''}{formatDecimal(celda.diferencia, 0)}</StatusPill>,
        conteo: <span title="La existencia inicial viene de un conteo físico, no del corte del ERP"><StatusPill tone="violet">conteo</StatusPill></span>,
        sin_verificacion: <StatusPill tone="slate">sin verificar</StatusPill>,
        sin_dato: null,
    }[celda.estado];

    return (
        <span className="inline-flex items-center gap-1.5 justify-end">
            {pill}
            {cifra}
        </span>
    );
}

function EstadoCierre({ c }: { c: CierreListado }) {
    return c.ok
        ? <StatusPill tone="emerald">Completo</StatusPill>
        : <span title={c.error ?? ''}><StatusPill tone="rose">Error</StatusPill></span>;
}

export default function CierresInventarioPage() {
    const sucursales = useSucursales();
    const [sucursal, setSucursal] = useState('');
    const [search, setSearch] = useState('');
    const [soloDiferencias, setSoloDiferencias] = useState(false);
    const [soloNegativos, setSoloNegativos] = useState(false);
    const [generando, setGenerando] = useState(false);
    const [mensaje, setMensaje] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null);

    const lista = useInventoryReport<ListaResponse>('/api/inventarios/cierres', {});
    const comp = useInventoryReport<ComparacionResponse>('/api/inventarios/cierres/comparar', { sucursal });

    const sucursalNombre = sucursales.find(s => String(s.IdSucursal) === sucursal)?.Sucursal ?? '';
    const data = comp.data?.data ?? null;
    // Mientras llega la sucursal recién elegida, el hook conserva los datos de la
    // anterior: las etiquetas que acompañan a los datos salen de `data`.
    const sucursalDatos = sucursales.find(s => s.IdSucursal === data?.sucursal)?.Sucursal ?? '';
    const hoyGuardado = data ? data.cierres.some(c => c.fecha === data.hoy.fecha) : false;
    const filas = useMemo(
        () => filtrarComparacion(data?.comparacion.filas ?? [], { search, soloDiferencias, soloNegativos }),
        [data, search, soloDiferencias, soloNegativos]
    );

    const guardarCierre = async () => {
        setGenerando(true);
        setMensaje(null);
        try {
            const res = await fetch('/api/inventarios/cierres', { method: 'POST' });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || 'No se pudo guardar el cierre');
            const fallidas = Number(json.fallidas || 0);
            setMensaje({
                tono: fallidas > 0 ? 'error' : 'ok',
                texto: `Cierre del ${formatDate(json.data.fecha)} guardado a las ${formatDateTime(json.data.generadoEn)}: ${json.data.sucursales.length} sucursales${fallidas > 0 ? `, ${fallidas} con error` : ''}.`,
            });
            lista.refresh();
            comp.refresh();
        } catch (err: unknown) {
            setMensaje({ tono: 'error', texto: getErrorMessage(err, 'No se pudo guardar el cierre') });
        } finally {
            setGenerando(false);
        }
    };

    const columnas = data?.comparacion.columnas ?? [];
    const columnasTabla: Column<FilaComparacion>[] = [
        { key: 'Codigo', label: 'Código', render: r => <span className="font-mono text-xs font-bold text-blue-700 whitespace-nowrap">{r.Codigo}</span> },
        {
            key: 'Descripcion',
            label: 'Descripción',
            render: r => (
                <div className="min-w-[220px]">
                    <p className="font-bold text-slate-800 leading-tight">{r.Descripcion}</p>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{r.Marca} · {r.Depto}</p>
                </div>
            ),
        },
        ...columnas.flatMap<Column<FilaComparacion>>((col, i) =>
            col.esHoy
                ? [
                    { key: `corte-${i}`, label: 'Corte ERP hoy', align: 'right', render: r => <Verificada valor={r.celdas[i].exiInicial} celda={r.celdas[i]} primera={i === 0} />, sortValue: r => r.celdas[i].exiInicial ?? Number.NEGATIVE_INFINITY },
                    { key: `entradas-${i}`, label: 'Entradas hoy', align: 'right', render: r => (r.celdas[i].entradas > 0 ? <span className="font-bold text-emerald-600">+{formatDecimal(r.celdas[i].entradas, 0)}</span> : <span className="text-slate-300">—</span>), sortValue: r => r.celdas[i].entradas },
                    { key: `salidas-${i}`, label: 'Salidas hoy', align: 'right', render: r => (r.celdas[i].salidas > 0 ? <span className="font-bold text-amber-600">−{formatDecimal(r.celdas[i].salidas, 0)}</span> : <span className="text-slate-300">—</span>), sortValue: r => r.celdas[i].salidas },
                    { key: `hoy-${i}`, label: 'Hoy (en vivo)', align: 'right', render: r => <Verificada valor={r.celdas[i].exiFinal} celda={r.celdas[i]} primera />, sortValue: r => r.celdas[i].exiFinal ?? Number.NEGATIVE_INFINITY },
                ]
                : [
                    { key: col.clave, label: col.etiqueta, align: 'right', render: r => <Verificada valor={r.celdas[i].exiFinal} celda={r.celdas[i]} primera={i === 0} />, sortValue: r => r.celdas[i].exiFinal ?? Number.NEGATIVE_INFINITY },
                ]
        ),
        {
            key: 'diferenciaTotal',
            label: 'Diferencia',
            align: 'right',
            render: r => (r.diferenciaTotal > 0 ? <span className="font-black text-rose-600">{formatDecimal(r.diferenciaTotal, 0)}</span> : <span className="text-slate-300">—</span>),
        },
    ];

    const columnasLista: Column<CierreListado>[] = [
        { key: 'fecha', label: 'Fecha', render: c => <span className="font-bold text-slate-800 whitespace-nowrap">{formatDate(c.fecha)}</span> },
        { key: 'Sucursal', label: 'Sucursal', render: c => <span className="font-semibold text-slate-700">{c.Sucursal}</span> },
        { key: 'generadoEn', label: 'Hora', render: c => <span className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(c.generadoEn)}</span>, sortValue: c => new Date(c.generadoEn).getTime() },
        { key: 'fechaCorteERP', label: 'Corte ERP', render: c => <span className="text-xs text-slate-500 whitespace-nowrap">{formatDate(c.fechaCorteERP)}</span>, sortValue: c => (c.fechaCorteERP ? new Date(c.fechaCorteERP).getTime() : 0) },
        { key: 'articulos', label: 'Artículos', align: 'right', render: c => formatInt(c.articulos) },
        { key: 'conMovimiento', label: 'Con movimiento', align: 'right', render: c => formatInt(c.conMovimiento) },
        { key: 'unidades', label: 'Unidades', align: 'right', render: c => <span className="font-bold text-slate-800">{formatInt(c.unidades)}</span> },
        { key: 'valor', label: 'Valor a costo', align: 'right', render: c => formatCurrency(c.valor) },
        { key: 'negativos', label: 'Negativos', align: 'right', render: c => <span className={c.negativos > 0 ? 'font-bold text-rose-600' : ''}>{formatInt(c.negativos)}</span> },
        { key: 'ok', label: 'Estado', render: c => <EstadoCierre c={c} />, sortValue: c => (c.ok ? 1 : 0) },
    ];

    const requiereSucursal = !comp.data || comp.data.requiereSucursal || !data;
    const kpis = data?.comparacion.kpis;
    const etiquetaColumna = (clave: string) => columnas.find(c => c.clave === clave)?.etiqueta ?? clave;

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <InventoryHeader
                title="Cierres de Inventario"
                icon={CalendarCheck}
                badge={
                    comp.refreshing && sucursalNombre
                        ? `Cargando ${sucursalNombre}…`
                        : lista.data ? `Hoy + ${lista.data.retencionDias} días de historial` : undefined
                }
                lastUpdated={comp.lastUpdated || lista.lastUpdated}
                loading={comp.loading || comp.refreshing || lista.refreshing}
                onRefresh={() => { lista.refresh(); comp.refresh(); }}
            >
                <button
                    type="button"
                    onClick={guardarCierre}
                    disabled={generando}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                    title="Toma la foto de hoy de todas las sucursales (reemplaza el cierre de hoy si ya existe)"
                >
                    <Save size={14} className={generando ? 'animate-pulse' : ''} />
                    {generando ? 'Guardando cierre…' : 'Guardar cierre ahora'}
                </button>
            </InventoryHeader>

            {mensaje && (
                <div className={`flex items-start gap-3 rounded-2xl px-5 py-4 border text-xs ${mensaje.tono === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
                    {mensaje.tono === 'ok' ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : <XCircle size={18} className="shrink-0 mt-0.5" />}
                    <p className="font-semibold">{mensaje.texto}</p>
                </div>
            )}

            <InventoryFilters
                sucursales={sucursales}
                selectionMode="single"
                selectedSucursales={sucursal ? [sucursal] : []}
                onSucursalesChange={ids => setSucursal(ids[0] ?? '')}
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Filtrar: código, descripción o marca"
            >
                <div className="flex flex-col gap-1.5 pb-1.5">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap">
                        <input type="checkbox" checked={soloDiferencias} onChange={e => setSoloDiferencias(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer" />
                        Solo con diferencia
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap">
                        <input type="checkbox" checked={soloNegativos} onChange={e => setSoloNegativos(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer" />
                        Solo en negativo
                    </label>
                </div>
            </InventoryFilters>

            {comp.error && <ErrorState message={comp.error} onRetry={comp.refresh} />}

            {comp.loading && !comp.error && sucursal && (
                <LoadingState message={`Comparando los cierres de ${sucursalNombre || 'la sucursal'} con el inventario de hoy...`} />
            )}

            {!comp.loading && !comp.error && requiereSucursal && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 bg-white rounded-2xl border border-slate-100 shadow-xs">
                    <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                        <ShieldCheck size={26} />
                    </div>
                    <p className="text-sm font-bold text-slate-700 uppercase tracking-wider">Selecciona una sucursal para comparar</p>
                    <p className="text-xs text-slate-400 max-w-lg text-center">
                        Cada día, el corte que el ERP recalcula en la madrugada se compara con el cierre que el portal
                        guardó la noche anterior. Si coinciden artículo por artículo, el inventario del día está bien.
                    </p>
                </div>
            )}

            {data && kpis && !comp.loading && !comp.error && !requiereSucursal && (
                <>
                    {data.comparacion.columnas.length <= 1 && (
                        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-xs text-amber-900">
                            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                            <p>
                                {hoyGuardado
                                    ? `El cierre de hoy de ${sucursalDatos} ya está guardado. Mañana, cuando el ERP regenere su corte, tendrás la primera verificación.`
                                    : `Todavía no hay cierres anteriores guardados para ${sucursalDatos}. Guarda el cierre de hoy y mañana tendrás la primera verificación contra el corte del ERP.`}
                            </p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                        <KpiCard
                            label="Cuadran"
                            value={`${formatInt(kpis.cuadran)} / ${formatInt(kpis.articulos)}`}
                            hint="Artículos cuyo corte del ERP coincidió con el cierre anterior"
                            icon={ShieldCheck}
                            tone={kpis.conDiferencia === 0 && kpis.cuadran > 0 ? 'emerald' : 'slate'}
                        />
                        <KpiCard
                            label="Con diferencia"
                            value={formatInt(kpis.conDiferencia)}
                            hint={soloDiferencias ? 'Mostrando solo diferencias · clic para quitar' : 'Clic para ver solo estos artículos'}
                            icon={XCircle}
                            tone={kpis.conDiferencia > 0 ? 'rose' : 'slate'}
                            onClick={() => setSoloDiferencias(v => !v)}
                        />
                        <KpiCard
                            label="Unidades de diferencia"
                            value={formatInt(kpis.unidadesDiferencia)}
                            hint={`${formatCurrencyShort(kpis.valorDiferencia)} a costo`}
                            icon={AlertTriangle}
                            tone={kpis.unidadesDiferencia > 0 ? 'amber' : 'slate'}
                        />
                        <KpiCard
                            label="Cierres guardados"
                            value={formatInt(data.cierres.length)}
                            hint={data.cierres.length ? data.cierres.map(c => formatDate(c.fecha)).join(' · ') : 'Ninguno todavía'}
                            icon={History}
                            tone="blue"
                        />
                    </div>

                    {data.comparacion.transiciones.length > 0 && (
                        <Panel title="Verificación día a día" subtitle={`${sucursalDatos} · corte del ERP generado ${formatDateTime(data.corteGeneradoEn)} · hoy calculado en vivo ${formatDateTime(data.hoy.calculadoEn)}`}>
                            <ul className="space-y-2">
                                {data.comparacion.transiciones.map(t => (
                                    <li key={`${t.de}-${t.a}`} className="flex flex-wrap items-center gap-3 text-sm">
                                        <span className="font-semibold text-slate-700">{etiquetaColumna(t.de)} → {etiquetaColumna(t.a)}</span>
                                        {t.corteRenovado ? (
                                            <>
                                                <StatusPill tone={t.conDiferencia === 0 ? 'emerald' : 'rose'}>
                                                    {formatInt(t.cuadran)} / {formatInt(t.comparados)} cuadran
                                                </StatusPill>
                                                {t.conDiferencia > 0 && (
                                                    <span className="text-xs font-semibold text-rose-600">
                                                        {formatInt(t.conDiferencia)} con diferencia · {formatInt(t.unidadesDiferencia)} unidades
                                                    </span>
                                                )}
                                                {t.conConteo > 0 && (
                                                    <span className="text-xs font-semibold text-violet-600">
                                                        {formatInt(t.conConteo)} con conteo físico (no comparables)
                                                    </span>
                                                )}
                                            </>
                                        ) : (
                                            <StatusPill tone="amber">sin verificación: no hay un corte del ERP inmediato a ese cierre</StatusPill>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </Panel>
                    )}

                    <Panel
                        title={`Comparación · ${sucursalDatos}`}
                        subtitle="Cada columna muestra la existencia final de ese cierre; la marca indica si el corte del ERP con que abrió coincidió con el cierre anterior"
                        action={<span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{formatInt(filas.length)} artículos</span>}
                    >
                        <DataTable
                            key={`${data.sucursal}|${search}|${soloDiferencias}|${soloNegativos}`}
                            columns={columnasTabla}
                            rows={filas}
                            rowKey={r => String(r.IdArticulo)}
                            initialSort={{ key: 'diferenciaTotal', direction: 'desc' }}
                            rowClassName={r => (r.estado === 'diferencia' ? 'bg-rose-50/40' : '')}
                            emptyMessage="Ningún artículo coincide con los filtros."
                        />
                    </Panel>
                </>
            )}

            <Panel
                title="Cierres guardados"
                subtitle={lista.data ? `Se conservan el cierre de hoy y los ${lista.data.retencionDias} días anteriores; lo más viejo se purga automáticamente` : undefined}
            >
                {lista.error && <ErrorState message={lista.error} onRetry={lista.refresh} />}
                {lista.loading && !lista.error && <LoadingState message="Leyendo cierres guardados..." />}
                {lista.data && !lista.loading && (
                    <DataTable
                        columns={columnasLista}
                        rows={lista.data.data}
                        rowKey={c => String(c.IdCierre)}
                        initialSort={{ key: 'generadoEn', direction: 'desc' }}
                        pageSize={20}
                        rowClassName={c => (c.ok ? '' : 'bg-rose-50/40')}
                        emptyMessage="Todavía no hay cierres guardados. Pulsa «Guardar cierre ahora» o espera a la tarea programada de las 23:55."
                    />
                )}
            </Panel>
        </div>
    );
}
