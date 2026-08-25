'use client';

import React, { useState } from 'react';
import { Building2, Layers, PackageCheck, Warehouse, X } from 'lucide-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import DataTable, { Column, StatusPill } from '@/components/inventarios/DataTable';
import InventoryFilters, { ThresholdInput, useSucursales } from '@/components/inventarios/InventoryFilters';
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
    etiquetaSucursales,
    exportarExcel,
} from '@/components/inventarios/export-excel';
import { useInventoryReport } from '@/hooks/use-inventory-report';
import {
    formatCobertura,
    formatCurrency,
    formatCurrencyShort,
    formatDecimal,
    formatInt,
} from '@/lib/format';

interface SucursalRow {
    IdSucursal: number;
    Sucursal: string;
    SkusTotales: number;
    SkusConExistencia: number;
    SkusEnCero: number;
    SkusNegativos: number;
    Unidades: number;
    Valorizado: number;
    ValorNegativo: number;
    Quiebres: number;
    BajoMinimo: number;
    Exceso: number;
    SinRotacion: number;
    CoberturaGlobal: number | null;
    CostoVenta: number;
    VentaPeriodo: number;
    DesdeMovimientos: number;
}

interface DetalleRow {
    IdArticulo: number;
    IdSucursal: number;
    Sucursal: string;
    Producto: string;
    Codigo: string;
    Depto: string;
    Marca: string;
    Exi: number;
    CostoUnitario: number;
    ValorInventario: number;
    DemandaDiaria: number;
    Minimo: number;
    Cobertura: number | null;
    Estado: 'quiebre' | 'bajo_minimo' | 'sin_rotacion' | 'exceso' | 'sano';
    Fuente: 'movimientos' | 'costo';
}

interface PorSucursalResponse {
    kpis: {
        valorizado: number;
        valorNegativo: number;
        unidades: number;
        skusConExistencia: number;
        skusEnCero: number;
        skusNegativos: number;
        quiebres: number;
        bajoMinimo: number;
        exceso: number;
        sinRotacion: number;
        sucursales: number;
        desdeMovimientos: number;
        skusTotales: number;
    };
    data: SucursalRow[];
    rows: DetalleRow[];
    meta: { dias: number; diasExceso: number };
}

const ESTADO_PILL: Record<DetalleRow['Estado'], { tone: 'rose' | 'amber' | 'violet' | 'emerald' | 'slate'; label: string }> = {
    quiebre: { tone: 'rose', label: 'Quiebre' },
    bajo_minimo: { tone: 'amber', label: 'Bajo mínimo' },
    sin_rotacion: { tone: 'violet', label: 'Sin rotación' },
    exceso: { tone: 'amber', label: 'Exceso' },
    sano: { tone: 'emerald', label: 'Sano' },
};

export default function InventarioPorSucursalPage() {
    const sucursales = useSucursales();
    const [selectedSucursales, setSelectedSucursales] = useState<string[]>([]);
    const [dias, setDias] = useState(90);
    const [search, setSearch] = useState('');
    const [diasExceso, setDiasExceso] = useState(120);
    const [detalle, setDetalle] = useState<{ id: number; nombre: string } | null>(null);

    const resumen = useInventoryReport<PorSucursalResponse>(
        '/api/inventarios/por-sucursal',
        {
            sucursales: selectedSucursales.join(','),
            dias,
            diasExceso,
            search,
        },
        'search'
    );

    const detalleReporte = useInventoryReport<PorSucursalResponse>(
        '/api/inventarios/por-sucursal',
        {
            sucursales: detalle ? String(detalle.id) : '',
            dias,
            diasExceso,
            search,
            detalle: detalle ? 1 : undefined,
            limit: 500,
        },
        'search'
    );

    const { data, loading, refreshing, error, lastUpdated, refresh } = resumen;

    const chartData = (data?.data ?? []).map(s => ({
        name: s.Sucursal,
        Valorizado: Number(s.Valorizado || 0),
        'Desajuste negativo': Math.abs(Number(s.ValorNegativo || 0)),
    }));

    const handleExport = () => {
        if (!data) return;
        exportarExcel({
            archivo: 'inventario_por_sucursal',
            hoja: 'Por sucursal',
            titulo: 'Inventario por Sucursal',
            meta: [
                { label: 'Sucursales', value: etiquetaSucursales(selectedSucursales, sucursales) },
                { label: 'Historia de demanda', value: `${data.meta.dias} días` },
                { label: 'Inventario valorizado', value: formatCurrency(data.kpis.valorizado) },
                { label: 'SKUs con existencia', value: formatInt(data.kpis.skusConExistencia) },
            ],
            columnas: [
                colTexto('Sucursal', 'Sucursal', 24),
                colNumero('SKUs totales', 'SkusTotales', 14),
                colNumero('Con existencia', 'SkusConExistencia', 16),
                colNumero('En cero', 'SkusEnCero', 12),
                colNumero('Negativos', 'SkusNegativos', 12),
                colNumero('Unidades', 'Unidades', 14),
                colMoneda('Valorizado', 'Valorizado', 18),
                colMoneda('Desajuste negativo', 'ValorNegativo', 18),
                colNumero('Quiebres', 'Quiebres', 12),
                colNumero('Bajo mínimo', 'BajoMinimo', 14),
                colNumero('Exceso', 'Exceso', 12),
                colNumero('Sin rotación', 'SinRotacion', 14),
                colNumero('Cobertura (días)', 'CoberturaRedondeada', 16),
            ],
            filas: data.data.map(s => ({
                ...s,
                CoberturaRedondeada: s.CoberturaGlobal === null ? '' : Math.round(Number(s.CoberturaGlobal)),
            })),
        });
    };

    const columnasSucursal: Column<SucursalRow>[] = [
        {
            key: 'Sucursal',
            label: 'Sucursal',
            render: r => (
                <button
                    type="button"
                    onClick={() => setDetalle({ id: r.IdSucursal, nombre: r.Sucursal })}
                    className="font-bold text-slate-800 hover:text-blue-600 transition-colors cursor-pointer text-left"
                >
                    {r.Sucursal}
                </button>
            ),
        },
        { key: 'Valorizado', label: 'Valorizado', align: 'right', render: r => <span className="font-black text-slate-900">{formatCurrency(r.Valorizado)}</span> },
        { key: 'Unidades', label: 'Unidades', align: 'right', render: r => formatInt(r.Unidades) },
        { key: 'SkusConExistencia', label: 'Con stock', align: 'right', render: r => formatInt(r.SkusConExistencia) },
        { key: 'SkusEnCero', label: 'En cero', align: 'right', render: r => <span className="text-slate-500">{formatInt(r.SkusEnCero)}</span> },
        { key: 'SkusNegativos', label: 'Negativos', align: 'right', render: r => <span className={Number(r.SkusNegativos) > 0 ? 'font-bold text-rose-600' : 'text-slate-400'}>{formatInt(r.SkusNegativos)}</span> },
        { key: 'Quiebres', label: 'Quiebres', align: 'right', render: r => <span className="font-bold text-rose-600">{formatInt(r.Quiebres)}</span> },
        { key: 'BajoMinimo', label: 'Bajo mín.', align: 'right', render: r => <span className="font-bold text-amber-600">{formatInt(r.BajoMinimo)}</span> },
        { key: 'Exceso', label: 'Exceso', align: 'right', render: r => <span className="text-amber-700">{formatInt(r.Exceso)}</span> },
        { key: 'SinRotacion', label: 'Sin rotación', align: 'right', render: r => <span className="text-violet-600">{formatInt(r.SinRotacion)}</span> },
        {
            key: 'CoberturaGlobal',
            label: 'Cobertura',
            align: 'right',
            sortValue: r => (r.CoberturaGlobal === null ? Number.MAX_SAFE_INTEGER : Number(r.CoberturaGlobal)),
            render: r => <span className="font-semibold text-slate-600">{formatCobertura(r.CoberturaGlobal)}</span>,
        },
        {
            key: 'Fuente',
            label: 'Fuente',
            align: 'center',
            sortable: false,
            render: r => {
                const total = Number(r.SkusTotales || 0);
                const desde = Number(r.DesdeMovimientos || 0);
                if (total > 0 && desde === total) return <StatusPill tone="emerald">Movimientos</StatusPill>;
                if (desde === 0) return <StatusPill tone="slate">Costo</StatusPill>;
                return <StatusPill tone="amber">{`${Math.round((desde / total) * 100)}% mov.`}</StatusPill>;
            },
        },
    ];

    const columnasDetalle: Column<DetalleRow>[] = [
        { key: 'Estado', label: 'Estado', render: r => <StatusPill tone={ESTADO_PILL[r.Estado].tone}>{ESTADO_PILL[r.Estado].label}</StatusPill> },
        {
            key: 'Producto',
            label: 'Producto',
            render: r => (
                <div className="min-w-[180px]">
                    <p className="font-bold text-slate-800 leading-tight">{r.Producto}</p>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{r.Codigo} · {r.Depto}</p>
                </div>
            ),
        },
        { key: 'Exi', label: 'Existencia', align: 'right', render: r => formatDecimal(r.Exi, 0) },
        { key: 'Minimo', label: 'Mínimo', align: 'right', render: r => formatDecimal(r.Minimo, 0) },
        { key: 'DemandaDiaria', label: 'Salida/día', align: 'right', render: r => formatDecimal(r.DemandaDiaria, 2) },
        {
            key: 'Cobertura',
            label: 'Cobertura',
            align: 'right',
            sortValue: r => (r.Cobertura === null ? Number.MAX_SAFE_INTEGER : Number(r.Cobertura)),
            render: r => formatCobertura(r.Cobertura),
        },
        { key: 'CostoUnitario', label: 'Costo unit.', align: 'right', render: r => formatCurrency(r.CostoUnitario) },
        { key: 'ValorInventario', label: 'Valor', align: 'right', render: r => <span className="font-bold text-slate-800">{formatCurrency(r.ValorInventario)}</span> },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <InventoryHeader
                title="Inventario por Sucursal"
                icon={Warehouse}
                badge="Existencia a la fecha"
                lastUpdated={lastUpdated}
                loading={loading || refreshing}
                onRefresh={refresh}
            />

            <InventoryFilters
                sucursales={sucursales}
                selectedSucursales={selectedSucursales}
                onSucursalesChange={setSelectedSucursales}
                dias={dias}
                onDiasChange={setDias}
                search={search}
                onSearchChange={setSearch}
                onExport={handleExport}
                exportDisabled={!data}
            >
                <ThresholdInput label="Umbral de exceso" value={diasExceso} onChange={setDiasExceso} />
            </InventoryFilters>

            {error && <ErrorState message={error} onRetry={refresh} />}

            {loading && !error && <LoadingState message="Consolidando el inventario de la red..." />}

            {data && !loading && !error && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                        <KpiCard
                            label="Inventario valorizado"
                            value={formatCurrencyShort(data.kpis.valorizado)}
                            hint={`${formatInt(data.kpis.unidades)} unidades en ${data.kpis.sucursales} sucursales`}
                            icon={Warehouse}
                            tone="blue"
                        />
                        <KpiCard
                            label="SKUs con existencia"
                            value={formatInt(data.kpis.skusConExistencia)}
                            hint={`${formatInt(data.kpis.skusEnCero)} en cero · ${formatInt(data.kpis.skusNegativos)} negativos`}
                            icon={PackageCheck}
                            tone="emerald"
                        />
                        <KpiCard
                            label="Faltantes"
                            value={formatInt(data.kpis.quiebres + data.kpis.bajoMinimo)}
                            hint={`${formatInt(data.kpis.quiebres)} en quiebre · ${formatInt(data.kpis.bajoMinimo)} bajo mínimo`}
                            icon={Layers}
                            tone="rose"
                        />
                        <KpiCard
                            label="Desajuste negativo"
                            value={formatCurrencyShort(data.kpis.valorNegativo)}
                            hint="Existencias por debajo de cero"
                            icon={Building2}
                            tone="amber"
                        />
                    </div>

                    <Panel title="Inventario valorizado por sucursal" subtitle="Compara el valor en piso contra el desajuste negativo">
                        <div className="h-80 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 24 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fill: '#64748B', fontSize: 10, fontWeight: 700 }}
                                        tickLine={false}
                                        axisLine={false}
                                        interval={0}
                                        angle={-20}
                                        textAnchor="end"
                                        height={60}
                                    />
                                    <YAxis
                                        tickFormatter={(v) => formatCurrencyShort(v)}
                                        tick={{ fill: '#64748B', fontSize: 10, fontWeight: 700 }}
                                        tickLine={false}
                                        axisLine={false}
                                        width={96}
                                    />
                                    <Tooltip
                                        formatter={(value) => formatCurrency(value)}
                                        contentStyle={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #E2E8F0' }}
                                    />
                                    <Legend verticalAlign="top" height={34} />
                                    <Bar dataKey="Valorizado" fill="#2563EB" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Desajuste negativo" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Panel>

                    <Panel
                        title="Estado del inventario por sucursal"
                        subtitle="Haz clic en el nombre de una sucursal para ver su detalle"
                    >
                        <DataTable
                            columns={columnasSucursal}
                            rows={data.data}
                            rowKey={r => String(r.IdSucursal)}
                            initialSort={{ key: 'Valorizado', direction: 'desc' }}
                            pageSize={25}
                        />
                    </Panel>

                    {detalle && (
                        <Panel
                            title={`Detalle · ${detalle.nombre}`}
                            subtitle={
                                detalleReporte.loading
                                    ? 'Cargando artículos...'
                                    : `Top ${formatInt(detalleReporte.data?.rows.length ?? 0)} artículos por valor`
                            }
                            action={
                                <button
                                    type="button"
                                    onClick={() => setDetalle(null)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                                >
                                    <X size={13} />
                                    Cerrar
                                </button>
                            }
                        >
                            {detalleReporte.loading ? (
                                <LoadingState message="Cargando artículos de la sucursal..." />
                            ) : detalleReporte.error ? (
                                <ErrorState message={detalleReporte.error} onRetry={detalleReporte.refresh} />
                            ) : (
                                <DataTable
                                    columns={columnasDetalle}
                                    rows={detalleReporte.data?.rows ?? []}
                                    rowKey={r => `${r.IdSucursal}-${r.IdArticulo}`}
                                    initialSort={{ key: 'ValorInventario', direction: 'desc' }}
                                    emptyMessage="Esta sucursal no tiene artículos con los filtros aplicados."
                                />
                            )}
                        </Panel>
                    )}
                </>
            )}
        </div>
    );
}
