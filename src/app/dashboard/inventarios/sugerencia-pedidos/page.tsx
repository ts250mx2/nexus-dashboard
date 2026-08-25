'use client';

import React, { useState } from 'react';
import {
    ClipboardList,
    PackagePlus,
    Truck,
    Users,
    Wallet,
} from 'lucide-react';
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
import { cn } from '@/lib/utils';

interface SugerenciaRow {
    IdArticulo: number;
    IdSucursal: number;
    Sucursal: string;
    Producto: string;
    Codigo: string;
    Depto: string;
    Marca: string;
    IdProveedor: number;
    Proveedor: string;
    Exi: number;
    EnTransito: number;
    Disponible: number;
    PuntoReorden: number;
    NivelObjetivo: number;
    Sugerido: number;
    CostoUnitario: number;
    CostoSugerido: number;
    DemandaDiaria: number;
    Cobertura: number | null;
    DiasSurtidoUsado: number;
    Urgencia: 'agotado' | 'critico' | 'reponer';
    Origen: 'demanda' | 'minimo_erp';
}

interface SugerenciaResponse {
    kpis: {
        skusASurtir: number;
        unidadesSugeridas: number;
        inversionEstimada: number;
        proveedores: number;
        sucursales: number;
        agotados: number;
        porMinimoErp: number;
        unidadesEnTransito: number;
    };
    porProveedor: { Proveedor: string; IdProveedor: number; Skus: number; Unidades: number; Costo: number }[];
    porSucursal: { IdSucursal: number; Sucursal: string; Skus: number; Unidades: number; Costo: number; Agotados: number }[];
    rows: SugerenciaRow[];
    meta: { dias: number; diasCobertura: number; ignorarTransito: boolean; filasTotales: number; truncado: boolean };
}

const URGENCIA_PILL: Record<SugerenciaRow['Urgencia'], { tone: 'rose' | 'amber' | 'emerald'; label: string }> = {
    agotado: { tone: 'rose', label: 'Agotado' },
    critico: { tone: 'amber', label: 'Crítico' },
    reponer: { tone: 'emerald', label: 'Reponer' },
};

type UrgenciaFiltro = 'todas' | 'agotado' | 'critico' | 'reponer';

export default function SugerenciaPedidosPage() {
    const sucursales = useSucursales();
    const [selectedSucursales, setSelectedSucursales] = useState<string[]>([]);
    const [dias, setDias] = useState(90);
    const [search, setSearch] = useState('');
    const [diasCobertura, setDiasCobertura] = useState(60);
    const [ignorarTransito, setIgnorarTransito] = useState(false);
    const [urgencia, setUrgencia] = useState<UrgenciaFiltro>('todas');
    const [proveedor, setProveedor] = useState<string>('todos');

    const { data, loading, refreshing, error, lastUpdated, refresh } = useInventoryReport<SugerenciaResponse>(
        '/api/inventarios/sugerencia-pedidos',
        {
            sucursales: selectedSucursales.join(','),
            dias,
            diasCobertura,
            search,
            ignorarTransito: ignorarTransito ? 1 : undefined,
            limit: 1000,
        },
        'search'
    );

    const rows = data?.rows ?? [];
    const filteredRows = rows.filter(r =>
        (urgencia === 'todas' || r.Urgencia === urgencia) &&
        (proveedor === 'todos' || r.Proveedor === proveedor)
    );

    const totalFiltrado = filteredRows.reduce((a, r) => a + Number(r.CostoSugerido || 0), 0);
    const unidadesFiltradas = filteredRows.reduce((a, r) => a + Number(r.Sugerido || 0), 0);

    const handleExport = () => {
        if (!data) return;
        exportarExcel({
            archivo: 'sugerencia_de_pedidos',
            hoja: 'Sugerido',
            titulo: 'Sugerencia de Pedidos',
            meta: [
                { label: 'Sucursales', value: etiquetaSucursales(selectedSucursales, sucursales) },
                { label: 'Historia de demanda', value: `${data.meta.dias} días` },
                { label: 'Cobertura objetivo', value: `${data.meta.diasCobertura} días` },
                { label: 'Mercancía en tránsito', value: data.meta.ignorarTransito ? 'Ignorada' : 'Descontada del sugerido' },
                { label: 'Proveedor', value: proveedor === 'todos' ? 'Todos' : proveedor },
                { label: 'Inversión estimada', value: formatCurrency(totalFiltrado) },
            ],
            columnas: [
                colTexto('Proveedor', 'Proveedor', 28),
                colTexto('Sucursal', 'Sucursal', 20),
                colTexto('Código', 'Codigo', 14),
                colTexto('Producto', 'Producto', 34),
                colTexto('Urgencia', 'UrgenciaTexto', 12),
                colNumero('Existencia', 'ExiRedondeada'),
                colNumero('En tránsito', 'TransitoRedondeado', 14),
                colNumero('Punto de reorden', 'ReordenRedondeado', 16),
                colNumero('Sugerido a pedir', 'Sugerido', 16),
                colMoneda('Costo unitario', 'CostoUnitario'),
                colMoneda('Costo del pedido', 'CostoSugerido', 18),
            ],
            filas: filteredRows.map(r => ({
                ...r,
                UrgenciaTexto: URGENCIA_PILL[r.Urgencia].label,
                ExiRedondeada: Math.round(Number(r.Exi || 0)),
                TransitoRedondeado: Math.round(Number(r.EnTransito || 0)),
                ReordenRedondeado: Math.round(Number(r.PuntoReorden || 0)),
            })),
            totales: {
                label: 'TOTAL',
                values: { Sugerido: unidadesFiltradas, CostoSugerido: totalFiltrado },
            },
        });
    };

    const columns: Column<SugerenciaRow>[] = [
        { key: 'Urgencia', label: 'Urgencia', render: r => <StatusPill tone={URGENCIA_PILL[r.Urgencia].tone}>{URGENCIA_PILL[r.Urgencia].label}</StatusPill> },
        { key: 'Sucursal', label: 'Sucursal', render: r => <span className="font-semibold text-slate-700">{r.Sucursal}</span> },
        {
            key: 'Producto',
            label: 'Producto',
            render: r => (
                <div className="min-w-[190px]">
                    <p className="font-bold text-slate-800 leading-tight">{r.Producto}</p>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{r.Codigo} · {r.Marca}</p>
                </div>
            ),
        },
        { key: 'Proveedor', label: 'Proveedor', render: r => <span className="text-xs text-slate-600 font-semibold">{r.Proveedor}</span> },
        { key: 'Exi', label: 'Existencia', align: 'right', render: r => <span className={Number(r.Exi) <= 0 ? 'text-rose-600 font-black' : ''}>{formatDecimal(r.Exi, 0)}</span> },
        {
            key: 'EnTransito',
            label: 'En tránsito',
            align: 'right',
            render: r => (Number(r.EnTransito) > 0
                ? <span className="font-semibold text-blue-600">{formatDecimal(r.EnTransito, 0)}</span>
                : <span className="text-slate-300">—</span>),
        },
        { key: 'PuntoReorden', label: 'Punto reorden', align: 'right', render: r => formatDecimal(r.PuntoReorden, 0) },
        { key: 'DemandaDiaria', label: 'Salida/día', align: 'right', render: r => formatDecimal(r.DemandaDiaria, 2) },
        {
            key: 'Cobertura',
            label: 'Cobertura',
            align: 'right',
            sortValue: r => (r.Cobertura === null ? Number.MAX_SAFE_INTEGER : Number(r.Cobertura)),
            render: r => formatCobertura(r.Cobertura),
        },
        {
            key: 'Sugerido',
            label: 'Pedir',
            align: 'right',
            render: r => <span className="font-black text-blue-700 text-base">{formatInt(r.Sugerido)}</span>,
        },
        { key: 'CostoSugerido', label: 'Costo del pedido', align: 'right', render: r => <span className="font-bold text-slate-800">{formatCurrency(r.CostoSugerido)}</span> },
        {
            key: 'Origen',
            label: 'Base',
            align: 'center',
            render: r => (r.Origen === 'demanda'
                ? <StatusPill tone="emerald">Demanda</StatusPill>
                : <StatusPill tone="slate">Mínimo ERP</StatusPill>),
        },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <InventoryHeader
                title="Sugerencia de Pedidos"
                icon={ClipboardList}
                badge="Punto de reorden"
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
                <div className="w-full lg:w-44">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">
                        Mercancía en tránsito
                    </label>
                    <button
                        type="button"
                        onClick={() => setIgnorarTransito(v => !v)}
                        className={cn(
                            'w-full px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-colors cursor-pointer',
                            ignorarTransito
                                ? 'bg-amber-50 border-amber-200 text-amber-700'
                                : 'bg-blue-50 border-blue-200 text-blue-700'
                        )}
                    >
                        {ignorarTransito ? 'Ignorada' : 'Descontada'}
                    </button>
                </div>
            </InventoryFilters>

            {error && <ErrorState message={error} onRetry={refresh} />}

            {loading && !error && <LoadingState message="Calculando el sugerido de compra..." />}

            {data && !loading && !error && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                        <KpiCard
                            label="Inversión estimada"
                            value={formatCurrencyShort(data.kpis.inversionEstimada)}
                            hint={`${formatInt(data.kpis.unidadesSugeridas)} unidades a pedir`}
                            icon={Wallet}
                            tone="blue"
                        />
                        <KpiCard
                            label="SKUs a surtir"
                            value={formatInt(data.kpis.skusASurtir)}
                            hint={`En ${data.kpis.sucursales} sucursales`}
                            icon={PackagePlus}
                            tone="emerald"
                        />
                        <KpiCard
                            label="Agotados"
                            value={formatInt(data.kpis.agotados)}
                            hint="Sin existencia y por debajo del punto de reorden"
                            icon={ClipboardList}
                            tone="rose"
                            onClick={() => setUrgencia('agotado')}
                        />
                        <KpiCard
                            label="Proveedores"
                            value={formatInt(data.kpis.proveedores)}
                            hint={`${formatInt(data.kpis.unidadesEnTransito)} unidades ya en camino`}
                            icon={Users}
                            tone="violet"
                        />
                    </div>

                    {data.kpis.porMinimoErp > 0 && (
                        <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5">
                            <Truck size={16} className="text-slate-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-slate-600 leading-relaxed">
                                <span className="font-bold text-slate-800">{formatInt(data.kpis.porMinimoErp)} sugerencias</span> salen
                                del mínimo capturado en el ERP y no de venta reciente: el artículo tiene existencia mínima configurada
                                pero no registró salidas en los últimos {data.meta.dias} días. Se marcan con la etiqueta
                                {' '}<span className="font-bold">Mínimo ERP</span> en la columna «Base».
                            </p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                        <Panel title="Pedido por proveedor" subtitle="Agrupado para convertirse en orden de compra">
                            <DataTable
                                columns={[
                                    {
                                        key: 'Proveedor',
                                        label: 'Proveedor',
                                        render: r => (
                                            <button
                                                type="button"
                                                onClick={() => setProveedor(r.Proveedor)}
                                                className="font-bold text-slate-800 hover:text-blue-600 transition-colors cursor-pointer text-left"
                                            >
                                                {r.Proveedor}
                                            </button>
                                        ),
                                    },
                                    { key: 'Skus', label: 'SKUs', align: 'right', render: r => formatInt(r.Skus) },
                                    { key: 'Unidades', label: 'Unidades', align: 'right', render: r => formatInt(r.Unidades) },
                                    { key: 'Costo', label: 'Costo', align: 'right', render: r => <span className="font-black text-slate-900">{formatCurrency(r.Costo)}</span> },
                                ]}
                                rows={data.porProveedor}
                                rowKey={r => r.Proveedor}
                                initialSort={{ key: 'Costo', direction: 'desc' }}
                                pageSize={15}
                            />
                        </Panel>

                        <Panel title="Pedido por sucursal" subtitle={`${data.porSucursal.length} sucursales con necesidad de resurtido`}>
                            <DataTable
                                columns={[
                                    { key: 'Sucursal', label: 'Sucursal', render: r => <span className="font-bold text-slate-800">{r.Sucursal}</span> },
                                    { key: 'Agotados', label: 'Agotados', align: 'right', render: r => <span className="font-bold text-rose-600">{formatInt(r.Agotados)}</span> },
                                    { key: 'Skus', label: 'SKUs', align: 'right', render: r => formatInt(r.Skus) },
                                    { key: 'Unidades', label: 'Unidades', align: 'right', render: r => formatInt(r.Unidades) },
                                    { key: 'Costo', label: 'Costo', align: 'right', render: r => <span className="font-black text-slate-900">{formatCurrency(r.Costo)}</span> },
                                ]}
                                rows={data.porSucursal}
                                rowKey={r => String(r.IdSucursal)}
                                initialSort={{ key: 'Costo', direction: 'desc' }}
                                pageSize={15}
                            />
                        </Panel>
                    </div>

                    <Panel
                        title="Sugerido de compra"
                        subtitle={`${formatInt(filteredRows.length)} artículos · ${formatCurrency(totalFiltrado)} · ${formatInt(unidadesFiltradas)} unidades`}
                        action={
                            <div className="flex flex-wrap items-center gap-2">
                                {proveedor !== 'todos' && (
                                    <button
                                        type="button"
                                        onClick={() => setProveedor('todos')}
                                        className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-100 cursor-pointer"
                                    >
                                        {proveedor} ✕
                                    </button>
                                )}
                                <select
                                    value={urgencia}
                                    onChange={e => setUrgencia(e.target.value as UrgenciaFiltro)}
                                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="todas">Toda urgencia</option>
                                    <option value="agotado">Agotados</option>
                                    <option value="critico">Críticos</option>
                                    <option value="reponer">Reponer</option>
                                </select>
                            </div>
                        }
                    >
                        <DataTable
                            columns={columns}
                            rows={filteredRows}
                            rowKey={r => `${r.IdSucursal}-${r.IdArticulo}`}
                            initialSort={{ key: 'CostoSugerido', direction: 'desc' }}
                            rowClassName={r => (r.Urgencia === 'agotado' ? 'bg-rose-50/30' : '')}
                            emptyMessage="No hay artículos que requieran pedido con los parámetros seleccionados."
                        />
                    </Panel>
                </>
            )}
        </div>
    );
}
