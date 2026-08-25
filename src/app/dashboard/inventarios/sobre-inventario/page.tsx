'use client';

import React, { useState } from 'react';
import { Boxes, Clock, Layers, Snowflake, Wallet } from 'lucide-react';
import { ResponsiveContainer, Tooltip, Treemap } from 'recharts';
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
    formatDate,
    formatDecimal,
    formatInt,
} from '@/lib/format';

interface ExcesoRow {
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
    Cobertura: number | null;
    DemandaDiaria: number;
    UnidadesExceso: number;
    CapitalInmovilizado: number;
    DiasSinMovimiento: number | null;
    UltimaSalida: string | null;
    Estado: 'exceso' | 'sin_rotacion';
    Fuente: 'movimientos' | 'costo';
}

interface SobreInventarioResponse {
    kpis: {
        capitalInmovilizado: number;
        skusExceso: number;
        valorExceso: number;
        skusSinRotacion: number;
        valorSinRotacion: number;
        unidadesExceso: number;
    };
    porSucursal: {
        IdSucursal: number;
        Sucursal: string;
        Capital: number;
        SkusExceso: number;
        SkusSinRotacion: number;
    }[];
    porDepto: { clave: string; Capital: number; Skus: number; Unidades: number }[];
    rows: ExcesoRow[];
    meta: { dias: number; diasCobertura: number; diasExceso: number; filasTotales: number; truncado: boolean };
}

type EstadoFiltro = 'todos' | 'exceso' | 'sin_rotacion';

const TREEMAP_COLORS = ['#7C3AED', '#8B5CF6', '#A78BFA', '#C4B5FD', '#6366F1', '#818CF8', '#A5B4FC'];

export default function SobreInventarioPage() {
    const sucursales = useSucursales();
    const [selectedSucursales, setSelectedSucursales] = useState<string[]>([]);
    const [dias, setDias] = useState(90);
    const [search, setSearch] = useState('');
    const [diasCobertura, setDiasCobertura] = useState(60);
    const [diasExceso, setDiasExceso] = useState(120);
    const [estado, setEstado] = useState<EstadoFiltro>('todos');

    const { data, loading, refreshing, error, lastUpdated, refresh } = useInventoryReport<SobreInventarioResponse>(
        '/api/inventarios/sobre-inventario',
        {
            sucursales: selectedSucursales.join(','),
            dias,
            diasCobertura,
            diasExceso,
            search,
            limit: 1000,
        },
        'search'
    );

    const rows = data?.rows ?? [];
    const filteredRows = estado === 'todos' ? rows : rows.filter(r => r.Estado === estado);

    const treemapData = (data?.porDepto ?? []).map((d, i) => ({
        name: d.clave,
        size: Math.max(Number(d.Capital || 0), 1),
        skus: d.Skus,
        fill: TREEMAP_COLORS[i % TREEMAP_COLORS.length],
    }));

    const handleExport = () => {
        if (!data) return;
        exportarExcel({
            archivo: 'sobre_inventario',
            hoja: 'Sobre-inventario',
            titulo: 'Sobre-inventario y capital inmovilizado',
            meta: [
                { label: 'Sucursales', value: etiquetaSucursales(selectedSucursales, sucursales) },
                { label: 'Historia de demanda', value: `${data.meta.dias} días` },
                { label: 'Cobertura objetivo', value: `${data.meta.diasCobertura} días` },
                { label: 'Umbral de exceso', value: `${data.meta.diasExceso} días` },
                { label: 'Capital inmovilizado', value: formatCurrency(data.kpis.capitalInmovilizado) },
            ],
            columnas: [
                colTexto('Sucursal', 'Sucursal', 20),
                colTexto('Código', 'Codigo', 14),
                colTexto('Producto', 'Producto', 34),
                colTexto('Departamento', 'Depto', 18),
                colTexto('Estado', 'EstadoTexto', 16),
                colNumero('Existencia', 'Exi'),
                colNumero('Cobertura (días)', 'CoberturaRedondeada', 16),
                colNumero('Unidades en exceso', 'ExcesoRedondeado', 18),
                colMoneda('Costo unitario', 'CostoUnitario'),
                colMoneda('Capital inmovilizado', 'CapitalInmovilizado', 20),
                colNumero('Días sin movimiento', 'DiasSinMovimiento', 18),
            ],
            filas: filteredRows.map(r => ({
                ...r,
                EstadoTexto: r.Estado === 'exceso' ? 'Exceso' : 'Sin rotación',
                CoberturaRedondeada: r.Cobertura === null ? '' : Math.round(Number(r.Cobertura)),
                ExcesoRedondeado: Math.round(Number(r.UnidadesExceso || 0)),
            })),
        });
    };

    const columns: Column<ExcesoRow>[] = [
        {
            key: 'Estado',
            label: 'Estado',
            render: r =>
                r.Estado === 'exceso'
                    ? <StatusPill tone="amber">Exceso</StatusPill>
                    : <StatusPill tone="violet">Sin rotación</StatusPill>,
        },
        { key: 'Sucursal', label: 'Sucursal', render: r => <span className="font-semibold text-slate-700">{r.Sucursal}</span> },
        {
            key: 'Producto',
            label: 'Producto',
            render: r => (
                <div className="min-w-[180px]">
                    <p className="font-bold text-slate-800 leading-tight">{r.Producto}</p>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                        {r.Codigo} · {r.Depto}
                    </p>
                </div>
            ),
        },
        { key: 'Exi', label: 'Existencia', align: 'right', render: r => formatDecimal(r.Exi, 0) },
        {
            key: 'Cobertura',
            label: 'Cobertura',
            align: 'right',
            sortValue: r => (r.Cobertura === null ? Number.MAX_SAFE_INTEGER : Number(r.Cobertura)),
            render: r => <span className="font-semibold text-slate-600">{formatCobertura(r.Cobertura)}</span>,
        },
        { key: 'UnidadesExceso', label: 'Sobrante', align: 'right', render: r => <span className="font-bold text-slate-800">{formatDecimal(r.UnidadesExceso, 0)}</span> },
        { key: 'CostoUnitario', label: 'Costo unit.', align: 'right', render: r => formatCurrency(r.CostoUnitario) },
        { key: 'CapitalInmovilizado', label: 'Capital parado', align: 'right', render: r => <span className="font-black text-violet-700">{formatCurrency(r.CapitalInmovilizado)}</span> },
        {
            key: 'DiasSinMovimiento',
            label: 'Sin movimiento',
            align: 'right',
            sortValue: r => (r.DiasSinMovimiento === null ? Number.MAX_SAFE_INTEGER : Number(r.DiasSinMovimiento)),
            render: r => (r.DiasSinMovimiento === null ? <span className="text-slate-400">Nunca</span> : `${formatInt(r.DiasSinMovimiento)} d`),
        },
        { key: 'UltimaSalida', label: 'Última salida', align: 'right', render: r => <span className="text-xs text-slate-500">{formatDate(r.UltimaSalida)}</span> },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <InventoryHeader
                title="Sobre-Inventario"
                icon={Boxes}
                badge="Capital inmovilizado"
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
                <ThresholdInput label="Cobertura objetivo" value={diasCobertura} onChange={setDiasCobertura} max={365} />
                <ThresholdInput label="Umbral de exceso" value={diasExceso} onChange={setDiasExceso} />
            </InventoryFilters>

            {error && <ErrorState message={error} onRetry={refresh} />}

            {loading && !error && <LoadingState message="Midiendo el capital inmovilizado..." />}

            {data && !loading && !error && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                        <KpiCard
                            label="Capital inmovilizado"
                            value={formatCurrencyShort(data.kpis.capitalInmovilizado)}
                            hint={`${formatInt(data.kpis.unidadesExceso)} unidades sobrantes`}
                            icon={Wallet}
                            tone="violet"
                            onClick={() => setEstado('todos')}
                        />
                        <KpiCard
                            label="SKUs en exceso"
                            value={formatInt(data.kpis.skusExceso)}
                            hint={`${formatCurrencyShort(data.kpis.valorExceso)} · rotan, pero de más`}
                            icon={Layers}
                            tone="amber"
                            onClick={() => setEstado('exceso')}
                        />
                        <KpiCard
                            label="SKUs sin rotación"
                            value={formatInt(data.kpis.skusSinRotacion)}
                            hint={`${formatCurrencyShort(data.kpis.valorSinRotacion)} · cero salidas en el periodo`}
                            icon={Snowflake}
                            tone="violet"
                            onClick={() => setEstado('sin_rotacion')}
                        />
                        <KpiCard
                            label="Umbral aplicado"
                            value={`${data.meta.diasExceso} días`}
                            hint={`Cobertura objetivo de ${data.meta.diasCobertura} días`}
                            icon={Clock}
                            tone="slate"
                        />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                        <Panel title="Concentración por departamento" subtitle="Tamaño = capital inmovilizado">
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <Treemap
                                        data={treemapData}
                                        dataKey="size"
                                        stroke="#fff"
                                        content={<TreemapCell />}
                                    >
                                        <Tooltip
                                            formatter={(value) => formatCurrency(value)}
                                            contentStyle={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #E2E8F0' }}
                                        />
                                    </Treemap>
                                </ResponsiveContainer>
                            </div>
                        </Panel>

                        <Panel title="Capital parado por sucursal" subtitle={`${data.porSucursal.length} sucursales`}>
                            <DataTable
                                columns={[
                                    { key: 'Sucursal', label: 'Sucursal', render: r => <span className="font-bold text-slate-800">{r.Sucursal}</span> },
                                    { key: 'SkusExceso', label: 'Exceso', align: 'right', render: r => <span className="font-bold text-amber-600">{formatInt(r.SkusExceso)}</span> },
                                    { key: 'SkusSinRotacion', label: 'Sin rotación', align: 'right', render: r => <span className="font-bold text-violet-600">{formatInt(r.SkusSinRotacion)}</span> },
                                    { key: 'Capital', label: 'Capital parado', align: 'right', render: r => <span className="font-black text-slate-800">{formatCurrency(r.Capital)}</span> },
                                ]}
                                rows={data.porSucursal}
                                rowKey={r => String(r.IdSucursal)}
                                initialSort={{ key: 'Capital', direction: 'desc' }}
                                pageSize={20}
                            />
                        </Panel>
                    </div>

                    <Panel
                        title="Detalle de artículos"
                        subtitle={`${formatInt(filteredRows.length)} de ${formatInt(data.meta.filasTotales)} registros`}
                        action={
                            <select
                                value={estado}
                                onChange={e => setEstado(e.target.value as EstadoFiltro)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="todos">Todos</option>
                                <option value="exceso">Solo exceso</option>
                                <option value="sin_rotacion">Solo sin rotación</option>
                            </select>
                        }
                    >
                        <DataTable
                            columns={columns}
                            rows={filteredRows}
                            rowKey={r => `${r.IdSucursal}-${r.IdArticulo}`}
                            initialSort={{ key: 'CapitalInmovilizado', direction: 'desc' }}
                            emptyMessage="No hay sobre-inventario con los umbrales seleccionados."
                        />
                    </Panel>
                </>
            )}
        </div>
    );
}

/** Recharts inyecta la geometría de cada rectángulo en el componente de contenido. */
interface TreemapCellProps {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    name?: string;
    fill?: string;
    size?: number;
}

/** Celda del treemap con etiqueta legible sólo cuando el rectángulo la admite. */
function TreemapCell({ x = 0, y = 0, width = 0, height = 0, name = '', fill, size = 0 }: TreemapCellProps) {
    const showLabel = width > 74 && height > 34;

    return (
        <g>
            <rect x={x} y={y} width={width} height={height} fill={fill || '#8B5CF6'} stroke="#fff" strokeWidth={2} rx={4} />
            {showLabel && (
                <>
                    <text x={x + 8} y={y + 18} fill="#fff" fontSize={11} fontWeight={800}>
                        {String(name).slice(0, Math.floor(width / 7))}
                    </text>
                    <text x={x + 8} y={y + 32} fill="rgba(255,255,255,.85)" fontSize={10} fontWeight={600}>
                        {formatCurrencyShort(size)}
                    </text>
                </>
            )}
        </g>
    );
}
