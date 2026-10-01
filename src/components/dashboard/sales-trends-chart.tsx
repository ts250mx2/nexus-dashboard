"use client";

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface SalesTrendsChartProps {
  data: any[];
  height?: number;
  color?: string;
  groupBy?: 'dia' | 'semana' | 'mes';
  isMulti?: boolean;
  metric?: 'venta' | 'operaciones' | 'ticket';
}

const DEFAULT_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#EF4444', // Red
];

/**
 * Sufijo de la serie que dibuja el tramo incompleto.
 *
 * El primero y el último periodo casi siempre quedan cortados por el rango (un
 * mes en curso con tres días, una semana que arranca a media semana). Si se
 * pintan igual que los completos, la línea se desploma y parece una caída de
 * venta. Por eso cada serie se parte en dos: la sólida corta en los periodos
 * parciales y esta los dibuja punteados.
 */
const SUFIJO_PARCIAL = '__parcial';

/** Lo que recharts entrega por serie en el tooltip. */
interface EntradaTooltip {
  name: string;
  value: number | null;
  color?: string;
  payload: Record<string, number | string | boolean | null | undefined>;
}

/** Lo que recharts entrega al pintar el punto de un dato. */
interface PuntoDeLinea {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: { Parcial?: boolean };
}

const getStoreColor = (name: string, index: number) => {
  if (!name) return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
  // Dynamic color hashing based on name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorIndex = Math.abs(hash) % DEFAULT_COLORS.length;
  return DEFAULT_COLORS[colorIndex];
};

/** Id de gradiente seguro para usar en el SVG. */
const idGradiente = (clave: string) => `grad_${clave.replace(/[^a-zA-Z0-9]+/g, '_')}`;

export function SalesTrendsChart({
  data,
  height = 300,
  color = "#3B82F6",
  groupBy = 'dia',
  isMulti = false,
  metric = 'venta'
}: SalesTrendsChartProps) {
  const formatValue = (val: number) => {
    if (metric === 'operaciones') return new Intl.NumberFormat('es-MX').format(val);
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    if (groupBy === 'mes') {
      return d.toLocaleDateString("es-MX", {
        month: "short",
        year: "2-digit",
      });
    }
    if (groupBy === 'semana') {
      return `S${d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}`;
    }
    return d.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
    });
  };

  const metricLabel = useMemo(() => {
    if (metric === 'venta') return 'Ventas';
    if (metric === 'operaciones') return 'Operaciones';
    return 'Ticket Promedio';
  }, [metric]);

  const activeStores = useMemo(() => {
    const stores = new Set<string>();
    data.forEach(item => { if (item.Tienda) stores.add(item.Tienda); });
    return Array.from(stores);
  }, [data]);

  /** Una entrada por serie: la clave del dato, su nombre y su color. */
  const series = useMemo(() => (
    isMulti
      ? activeStores.map((store, i) => ({ clave: store, nombre: store, color: getStoreColor(store, i) }))
      : [{ clave: 'Total', nombre: metricLabel, color }]
  ), [isMulti, activeStores, metricLabel, color]);

  // Transform data for multi-line: [{ Fecha, Store1: Value, Store2: Value }]
  const transformedData = useMemo(() => {
    const map = new Map<string, any>();
    data.forEach(item => {
      const date = new Date(item.Fecha).toISOString();
      if (!map.has(date)) {
        map.set(date, {
          Fecha: item.Fecha,
          // La cobertura la manda el API y es la misma para todas las sucursales
          // de esa fecha, porque depende del rango, no de la tienda.
          Parcial: item.Parcial === true,
          DiasCubiertos: item.DiasCubiertos,
          DiasPeriodo: item.DiasPeriodo,
        });
      }
      const entry = map.get(date);
      const storeKey = item.Tienda || 'Total';

      let val = item.Total;
      if (metric === 'operaciones') val = item.Operaciones;
      else if (metric === 'ticket') val = item.Operaciones > 0 ? item.Total / item.Operaciones : 0;

      entry[storeKey] = val;
      entry[`${storeKey}_total`] = item.Total;
      entry[`${storeKey}_ops`] = item.Operaciones;
    });

    const ordenados = Array.from(map.values()).sort(
      (a, b) => new Date(a.Fecha).getTime() - new Date(b.Fecha).getTime()
    );

    // El tramo punteado incluye también al vecino completo de cada periodo
    // parcial; si no, el segmento que los une no se dibujaría.
    return ordenados.map((punto, i) => {
      const vecinoParcial = Boolean(ordenados[i - 1]?.Parcial || ordenados[i + 1]?.Parcial);
      const copia = { ...punto };
      for (const { clave } of series) {
        const valor = punto[clave] ?? null;
        copia[clave] = punto.Parcial ? null : valor;
        copia[`${clave}${SUFIJO_PARCIAL}`] = punto.Parcial || vecinoParcial ? valor : null;
      }
      return copia;
    });
  }, [data, metric, series]);

  const hayParciales = useMemo(
    () => transformedData.some(p => p.Parcial),
    [transformedData]
  );

  return (
    <div className="h-full flex flex-col">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={transformedData}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            {series.map(serie => (
              <linearGradient key={serie.clave} id={idGradiente(serie.clave)} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={serie.color} stopOpacity={0.1} />
                <stop offset="95%" stopColor={serie.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis
            dataKey="Fecha"
            tickFormatter={formatDate}
            tick={{ fontSize: 10, fontWeight: "bold", fill: "#94A3B8" }}
            axisLine={false}
            tickLine={false}
            dy={10}
            // Por mes son pocos puntos y caben todos: sin esto el eje se saltaba
            // etiquetas y el último periodo quedaba sin nombre, que fue lo que
            // hizo leer un octubre de un día como si fuera septiembre.
            interval={groupBy === 'mes' ? 0 : 'preserveStartEnd'}
          />
          <YAxis
            tickFormatter={(value) => {
              if (metric === 'operaciones') return value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value;
              return `$${value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value}`;
            }}
            tick={{ fontSize: 10, fontWeight: "bold", fill: "#94A3B8" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ stroke: isMulti ? '#94A3B8' : color, strokeWidth: 2, strokeDasharray: '5 5' }}
            content={({ active, payload, label }) => {
              if (!active || !payload || !payload.length) return null;

              // Cada serie viaja partida en dos (sólida y punteada): en cada punto
              // solo una trae valor, así que se queda la primera no nula por nombre.
              const vistos = new Set<string>();
              const entradas = payload as unknown as EntradaTooltip[];
              const lineas = entradas.filter(p => {
                if (p.value === null || p.value === undefined) return false;
                if (vistos.has(p.name)) return false;
                vistos.add(p.name);
                return true;
              });
              if (!lineas.length) return null;

              const punto = lineas[0].payload;

              return (
                <div className="bg-slate-900 text-white p-3 rounded-xl shadow-2xl border border-white/10 min-w-[200px]">
                  <p className="text-[10px] font-bold text-white/50 uppercase mb-2 border-b border-white/10 pb-1">
                    {formatDate(label as string)}
                  </p>
                  {punto?.Parcial && (
                    <p className="text-[9px] font-black uppercase text-amber-400 mb-2 leading-tight">
                      Periodo incompleto · {punto.DiasCubiertos} de {punto.DiasPeriodo} días
                    </p>
                  )}
                  <div className="space-y-3">
                    {lineas.map((p, i) => (
                      <div key={i} className="flex flex-col gap-1">
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-[9px] font-black uppercase truncate max-w-[120px]" style={{ color: p.color }}>
                            {p.name}
                          </span>
                          <span className="text-xs font-black text-white">{formatValue(p.value as number)}</span>
                        </div>
                        {isMulti && (
                          <div className="flex flex-col gap-0.5 opacity-40">
                            <div className="flex justify-between items-center">
                              <span className="text-[8px] font-bold uppercase">Ventas</span>
                              <span className="text-[9px] font-bold">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(p.payload[`${p.name}_total`] ?? 0))}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[8px] font-bold uppercase">Tickets</span>
                              <span className="text-[9px] font-bold">{String(p.payload[`${p.name}_ops`] ?? '')}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }}
          />
          {isMulti && activeStores.length > 0 && <Legend verticalAlign="top" height={36} content={(props) => {
            const { payload } = props;
            return (
              <div className="flex flex-wrap gap-4 mb-4">
                {payload?.map((entry: any, index: number) => (
                  <div key={`item-${index}`} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">{entry.value}</span>
                  </div>
                ))}
              </div>
            )
          }} />}

          {series.map(serie => (
            <Area
              key={serie.clave}
              type="monotone"
              dataKey={serie.clave}
              name={serie.nombre}
              stroke={serie.color}
              strokeWidth={isMulti ? 3 : 4}
              fillOpacity={1}
              fill={`url(#${idGradiente(serie.clave)})`}
              connectNulls={false}
              animationDuration={1000}
            />
          ))}

          {/* Tramo incompleto: misma línea, punteada y sin relleno. */}
          {series.map(serie => (
            <Area
              key={`${serie.clave}${SUFIJO_PARCIAL}`}
              type="monotone"
              dataKey={`${serie.clave}${SUFIJO_PARCIAL}`}
              name={serie.nombre}
              stroke={serie.color}
              strokeWidth={isMulti ? 3 : 4}
              strokeDasharray="7 5"
              fillOpacity={0}
              connectNulls={false}
              legendType="none"
              animationDuration={1000}
              dot={(props: PuntoDeLinea) => (
                props.payload?.Parcial
                  ? <circle key={props.index} cx={props.cx} cy={props.cy} r={4} fill="#fff" stroke={serie.color} strokeWidth={2} />
                  : <g key={props.index} />
              )}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>

      {hayParciales && (
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-center pt-1">
          <span className="text-amber-500">— — —</span> Periodo incompleto: al primero o al último le faltan días del rango
        </p>
      )}
    </div>
  );
}
