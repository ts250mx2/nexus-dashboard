'use client';

import React, { useState } from 'react';
import { AlertTriangle, PackageX, TrendingDown, Wallet } from 'lucide-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import DataTable, { Column, StatusPill } from '@/components/inventarios/DataTable';
import InventoryFilters, { useSucursales } from '@/components/inventarios/InventoryFilters';
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
    formatCurrency,
    formatCurrencyShort,
    formatDate,
    formatDecimal,
    formatInt,
} from '@/lib/format';

interface QuiebreRow {
    IdArticulo: number;
    IdSucursal: number;
    Sucursal: string;
    Producto: string;
    Codigo: string;
    Depto: string;
    Marca: string;
    Exi: number;
    Minimo: number;
    UnidadesFaltantes: number;
    DemandaDiaria: number;
    UnidadesPeriodo: number;
    PrecioPromedio: number;
    CostoUnitario: number;
    CostoReposicion: number;
    DiasSinStock: number;
    VentaPerdida: number;
    UltimaVenta: string | null;
    Estado: 'quiebre' | 'bajo_minimo';
    Fuente: 'movimientos' | 'costo';
}

interface QuiebresResponse {
    kpis: {
        skusQuiebre: number;
        skusBajoMinimo: number;
        ventaPerdida: number;
        unidadesFaltantes: number;
        costoReposicion: number;
        sucursalesAfectadas: number;
    };
    porSucursal: {
        IdSucursal: number;
        Sucursal: string;
        Quiebres: number;
        BajoMinimo: number;
        VentaPerdida: number;
        UnidadesFaltantes: number;
    }[];
    rows: QuiebreRow[];
    meta: { dias: number; filasTotales: number; truncado: boolean };
}

type EstadoFiltro = 'todos' | 'quiebre' | 'bajo_minimo';

export default function QuiebresStockPage() {
    const sucursales = useSucursales();
    const [selectedSucursales, setSelectedSucursales] = useState<string[]>([]);
    const [dias, setDias] = useState(90);
    const [search, setSearch] = useState('');
    const [estado, setEstado] = useState<EstadoFiltro>('todos');

    const { data, loading, refreshing, error, lastUpdated, refresh } = useInventoryReport<QuiebresResponse>(
        '/api/inventarios/quiebres',
        {
            sucursales: selectedSucursales.join(','),
            dias,
            search,
            limit: 1000,
        },
        'search'
    );

    const rows = data?.rows ?? [];
    const filteredRows = estado === 'todos' ? rows : rows.filter(r => r.Estado === estado);

    const chartData = (data?.porSucursal ?? []).slice(0, 12).map(s => ({
        name: s.Sucursal,
        'Venta perdida': Number(s.VentaPerdida || 0),
        quiebres: s.Quiebres,
    }));

    const handleExport = () => {
        if (!data) return;
        exportarExcel({
            archivo: 'quiebres_de_stock',
            hoja: 'Quiebres',
            titulo: 'Quiebres de Stock',
            meta: [
                { label: 'Sucursales', value: etiquetaSucursales(selectedSucursales, sucursales) },
                { label: 'Historia de demanda', value: `${data.meta.dias} días` },
                { label: 'SKUs en quiebre', value: formatInt(data.kpis.skusQuiebre) },
                { label: 'SKUs bajo mínimo', value: formatInt(data.kpis.skusBajoMinimo) },
                { label: 'Venta perdida estimada', value: formatCurrency(data.kpis.ventaPerdida) },
            ],
            columnas: [
                colTexto('Sucursal', 'Sucursal', 20),
                colTexto('Código', 'Codigo', 14),
                colTexto('Producto', 'Producto', 34),
                colTexto('Departamento', 'Depto', 18),
                colTexto('Marca', 'Marca', 16),
                colTexto('Estado', 'EstadoTexto', 14),
                colNumero('Existencia', 'Exi'),
                colNumero('Mínimo', 'MinimoRedondeado'),
                colNumero('Faltante', 'FaltanteRedondeado'),
                colNumero('Días sin stock', 'DiasSinStock', 14),
                colMoneda('Venta perdida', 'VentaPerdida'),
                colMoneda('Costo reposición', 'CostoReposicion', 18),
            ],
            filas: filteredRows.map(r => ({
                ...r,
                EstadoTexto: r.Estado === 'quiebre' ? 'Quiebre' : 'Bajo mínimo',
                MinimoRedondeado: Math.round(Number(r.Minimo || 0)),
                FaltanteRedondeado: Math.round(Number(r.UnidadesFaltantes || 0)),
            })),
        });
    };

    const columns: Column<QuiebreRow>[] = [
        {
            key: 'Estado',
            label: 'Estado',
            render: r =>
                r.Estado === 'quiebre'
                    ? <StatusPill tone="rose">Quiebre</StatusPill>
                    : <StatusPill tone="amber">Bajo mínimo</StatusPill>,
        },
        { key: 'Sucursal', label: 'Sucursal', render: r => <span className="font-semibold text-slate-700">{r.Sucursal}</span> },
        {
            key: 'Producto',
            label: 'Producto',
            render: r => (
                <div className="min-w-[180px]">
                    <p className="font-bold text-slate-800 leading-tight">{r.Producto}</p>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                        {r.Codigo} · {r.Marca}
                    </p>
                </div>
            ),
        },
        { key: 'Exi', label: 'Existencia', align: 'right', render: r => <span className={Number(r.Exi) <= 0 ? 'text-rose-600 font-black' : 'font-semibold'}>{formatDecimal(r.Exi, 0)}</span> },
        { key: 'Minimo', label: 'Mínimo', align: 'right', render: r => formatDecimal(r.Minimo, 0) },
        { key: 'UnidadesFaltantes', label: 'Faltan', align: 'right', render: r => <span className="font-bold text-slate-800">{formatDecimal(r.UnidadesFaltantes, 0)}</span> },
        { key: 'DemandaDiaria', label: 'Venta/día', align: 'right', render: r => formatDecimal(r.DemandaDiaria, 2) },
        { key: 'DiasSinStock', label: 'Días sin stock', align: 'right', render: r => (Number(r.DiasSinStock) > 0 ? formatInt(r.DiasSinStock) : '—') },
        { key: 'VentaPerdida', label: 'Venta perdida', align: 'right', render: r => <span className="font-black text-rose-600">{formatCurrency(r.VentaPerdida)}</span> },
        { key: 'CostoReposicion', label: 'Costo reposición', align: 'right', render: r => formatCurrency(r.CostoReposicion) },
        { key: 'UltimaVenta', label: 'Última venta', align: 'right', render: r => <span className="text-xs text-slate-500">{formatDate(r.UltimaVenta)}</span> },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <InventoryHeader
                title="Quiebres de Stock"
                icon={PackageX}
                badge="Faltantes accionables"
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
                exportDisabled={!data || filteredRows.length === 0}
            >
                <div className="w-full lg:w-44">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">
                        Estado
                    </label>
                    <select
                        value={estado}
                        onChange={e => setEstado(e.target.value as EstadoFiltro)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="todos">Todos</option>
                        <option value="quiebre">Solo quiebres</option>
                        <option value="bajo_minimo">Solo bajo mínimo</option>
                    </select>
                </div>
            </InventoryFilters>

            {error && <ErrorState message={error} onRetry={refresh} />}

            {loading && !error && <LoadingState message="Calculando quiebres de stock..." />}

            {data && !loading && !error && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                        <KpiCard
                            label="SKUs en quiebre"
                            value={formatInt(data.kpis.skusQuiebre)}
                            hint="Agotados donde sí hay demanda"
                            icon={PackageX}
                            tone="rose"
                            onClick={() => setEstado('quiebre')}
                        />
                        <KpiCard
                            label="SKUs bajo mínimo"
                            value={formatInt(data.kpis.skusBajoMinimo)}
                            hint="Todavía con stock, por debajo del punto de reorden"
                            icon={AlertTriangle}
                            tone="amber"
                            onClick={() => setEstado('bajo_minimo')}
                        />
                        <KpiCard
                            label="Venta perdida estimada"
                            value={formatCurrencyShort(data.kpis.ventaPerdida)}
                            hint={`Últimos ${data.meta.dias} días`}
                            icon={TrendingDown}
                            tone="rose"
                        />
                        <KpiCard
                            label="Costo de reposición"
                            value={formatCurrencyShort(data.kpis.costoReposicion)}
                            hint={`${formatInt(data.kpis.unidadesFaltantes)} unidades en ${data.kpis.sucursalesAfectadas} sucursales`}
                            icon={Wallet}
                            tone="slate"
                        />
                    </div>

                    <Panel
                        title="Venta perdida por sucursal"
                        subtitle="Estimada con la demanda diaria y los días sin existencia"
                    >
                        <div className="h-72 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fill: '#64748B', fontSize: 10, fontWeight: 700 }}
                                        tickLine={false}
                                        axisLine={false}
                                        dy={8}
                                        interval={0}
                                        angle={-20}
                                        textAnchor="end"
                                        height={56}
                                    />
                                    <YAxis
                                        tickFormatter={(v) => formatCurrencyShort(v)}
                                        tick={{ fill: '#64748B', fontSize: 10, fontWeight: 700 }}
                                        tickLine={false}
                                        axisLine={false}
                                        width={92}
                                    />
                                    <Tooltip
                                        formatter={(value) => formatCurrency(value)}
                                        contentStyle={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #E2E8F0' }}
                                    />
                                    <Bar dataKey="Venta perdida" radius={[4, 4, 0, 0]}>
                                        {chartData.map((entry, i) => (
                                            <Cell key={i} fill={i === 0 ? '#E11D48' : '#F43F5E'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Panel>

                    <Panel
                        title="Resumen por sucursal"
                        subtitle={`${data.porSucursal.length} sucursales con faltantes`}
                    >
                        <DataTable
                            columns={[
                                { key: 'Sucursal', label: 'Sucursal', render: r => <span className="font-bold text-slate-800">{r.Sucursal}</span> },
                                { key: 'Quiebres', label: 'Quiebres', align: 'right', render: r => <span className="font-black text-rose-600">{formatInt(r.Quiebres)}</span> },
                                { key: 'BajoMinimo', label: 'Bajo mínimo', align: 'right', render: r => <span className="font-bold text-amber-600">{formatInt(r.BajoMinimo)}</span> },
                                { key: 'UnidadesFaltantes', label: 'Unidades faltantes', align: 'right', render: r => formatInt(r.UnidadesFaltantes) },
                                { key: 'VentaPerdida', label: 'Venta perdida', align: 'right', render: r => <span className="font-bold text-slate-800">{formatCurrency(r.VentaPerdida)}</span> },
                            ]}
                            rows={data.porSucursal}
                            rowKey={r => String(r.IdSucursal)}
                            initialSort={{ key: 'VentaPerdida', direction: 'desc' }}
                            pageSize={20}
                        />
                    </Panel>

                    <Panel
                        title="Detalle de artículos"
                        subtitle={`${formatInt(filteredRows.length)} de ${formatInt(data.meta.filasTotales)} registros`}
                        action={
                            data.meta.truncado ? (
                                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                                    Resultado acotado — refina los filtros
                                </span>
                            ) : undefined
                        }
                    >
                        <DataTable
                            columns={columns}
                            rows={filteredRows}
                            rowKey={r => `${r.IdSucursal}-${r.IdArticulo}`}
                            initialSort={{ key: 'VentaPerdida', direction: 'desc' }}
                            rowClassName={r => (r.Estado === 'quiebre' ? 'bg-rose-50/30' : '')}
                            emptyMessage="Ninguna sucursal tiene faltantes con los filtros seleccionados."
                        />
                    </Panel>
                </>
            )}
        </div>
    );
}
