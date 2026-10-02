"use client";

import { useMemo } from 'react';
import { aFechaLocal } from '@/lib/periodos';
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

/** Lo que recharts entrega por serie en el tooltip. */
interface EntradaTooltip {
  name: string;
  value: number | null;
  color?: string;
  payload: Record<string, number | string | boolean | null | undefined>;
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
    const d = aFechaLocal(dateStr);
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
      const date = aFechaLocal(item.Fecha).toISOString();
      if (!map.has(date)) {
        map.set(date, {
          Fecha: item.Fecha,
          // Lo manda el API y es igual para todas las sucursales de esa fecha,
          // porque depende del rango consultado y no de la tienda.
          Parcial: item.Parcial === true,
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

    // Los periodos que el rango deja cortados no se grafican: un mes en curso
    // con un día, o la semana en que arranca el rango, valen una fracción de lo
    // que vale un periodo completo y deforman la tendencia. El API los marca.
    //
    // La excepción es cuando no queda ninguno completo (un rango dentro del mes
    // en curso, por ejemplo): ahí se grafica lo que haya, porque más vale un
    // periodo a medias que una gráfica en blanco.
    const todos = Array.from(map.values())
      .sort((a, b) => aFechaLocal(a.Fecha).getTime() - aFechaLocal(b.Fecha).getTime());
    const completos = todos.filter(punto => !punto.Parcial);
    return completos.length > 0 ? completos : todos;
  }, [data, metric]);

  // Con pocos puntos se marca cada dato: así un periodo suelto (que como línea
  // de un solo punto sería invisible) se sigue viendo.
  const marcarPuntos = transformedData.length <= 31;

  // Cuando lo único que hay son periodos a medias se grafican de todos modos,
  // pero conviene decirlo: si no, un mes de dos días se lee como un mes normal.
  const soloIncompletos = transformedData.length > 0 && transformedData.every(p => p.Parcial);

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

              return (
                <div className="bg-slate-900 text-white p-3 rounded-xl shadow-2xl border border-white/10 min-w-[200px]">
                  <p className="text-[10px] font-bold text-white/50 uppercase mb-2 border-b border-white/10 pb-1">
                    {formatDate(label as string)}
                  </p>
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
              dot={marcarPuntos ? { r: 3, fill: serie.color, strokeWidth: 0 } : false}
              animationDuration={1000}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>

      {soloIncompletos && (
        <p className="text-[9px] font-bold uppercase tracking-wider text-amber-600/70 text-center pt-1">
          El rango no cubre ningún periodo completo: lo que se muestra va a medias
        </p>
      )}
    </div>
  );
}
