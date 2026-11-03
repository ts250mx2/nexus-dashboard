'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Radio, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import {
    ETIQUETA_NIVEL,
    NivelTransmision,
    formatTranscurrido,
    formatTranscurridoCorto,
    nivelTransmision,
    ordenarPorUrgencia,
} from '@/lib/transmisiones';
import type { SucursalTransmision, TransmisionesResponse } from '@/app/api/dashboard/transmisiones/route';

/** Cada cuánto se vuelve a pedir al servidor (que a su vez guarda 60 s en caché). */
const REFRESCO_MS = 60_000;
/** Cada cuánto avanza el tiempo en pantalla entre una consulta y otra. */
const TIC_MS = 15_000;

/**
 * Entre más tiempo sin transmitir, más intenso el recuadro y más llena su barra.
 * El crítico va en sólido para que se vea desde lejos.
 */
const ESTILO: Record<NivelTransmision, { caja: string; tiempo: string; nombre: string; punto: string; barra: string; lleno: string }> = {
    ok: {
        caja: 'bg-emerald-50/60 border-emerald-200/70 dark:bg-emerald-950/20 dark:border-emerald-900/50',
        tiempo: 'text-emerald-600 dark:text-emerald-400',
        nombre: 'text-slate-600 dark:text-slate-300',
        punto: 'bg-emerald-500',
        barra: 'bg-emerald-500',
        lleno: 'w-1/5',
    },
    atencion: {
        caja: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/60',
        tiempo: 'text-amber-600 dark:text-amber-400',
        nombre: 'text-slate-600 dark:text-slate-300',
        punto: 'bg-amber-400',
        barra: 'bg-amber-400',
        lleno: 'w-2/5',
    },
    alerta: {
        caja: 'bg-orange-100 border-orange-300 dark:bg-orange-950/40 dark:border-orange-800/60',
        tiempo: 'text-orange-600 dark:text-orange-400',
        nombre: 'text-orange-900/80 dark:text-orange-200',
        punto: 'bg-orange-500',
        barra: 'bg-orange-500',
        lleno: 'w-3/5',
    },
    grave: {
        caja: 'bg-rose-100 border-rose-300 dark:bg-rose-950/50 dark:border-rose-800/60',
        tiempo: 'text-rose-600 dark:text-rose-400',
        nombre: 'text-rose-900/80 dark:text-rose-200',
        punto: 'bg-rose-500',
        barra: 'bg-rose-500',
        lleno: 'w-4/5',
    },
    critico: {
        caja: 'bg-rose-600 border-rose-700 shadow-sm shadow-rose-500/40 dark:bg-rose-700 dark:border-rose-500',
        tiempo: 'text-white',
        nombre: 'text-rose-50',
        punto: 'bg-white',
        barra: 'bg-rose-900/60',
        lleno: 'w-full',
    },
    inactiva: {
        caja: 'bg-slate-50 border-slate-200 dark:bg-slate-900/60 dark:border-slate-700',
        tiempo: 'text-slate-400 dark:text-slate-500',
        nombre: 'text-slate-400 dark:text-slate-500',
        punto: 'bg-slate-300 dark:bg-slate-600',
        barra: 'bg-slate-300 dark:bg-slate-700',
        lleno: 'w-0',
    },
};

const ORDEN_RESUMEN: NivelTransmision[] = ['critico', 'grave', 'alerta', 'atencion', 'ok'];

const PASTILLA: Record<NivelTransmision, string> = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/60',
    atencion: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/60',
    alerta: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800/60',
    grave: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/60',
    critico: 'bg-rose-600 text-white border-rose-700',
    inactiva: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
};

const FUENTE: Record<string, string> = {
    transmision: 'registro de transmisión',
    ticket: 'último ticket recibido',
};

type Vista = SucursalTransmision & { seg: number | null; nivel: NivelTransmision };

/** El detalle (fecha, fuente y computadoras) va en el globo al pasar el mouse. */
function detalle(s: Vista, transcurrido: number): string {
    const lineas = [
        `${s.Sucursal} · ${ETIQUETA_NIVEL[s.nivel]}`,
        s.ultima
            ? `Última: ${formatDateTime(s.ultima)} (${formatTranscurrido(s.seg)})${s.fuente ? ` · ${FUENTE[s.fuente]}` : ''}`
            : 'Nunca ha transmitido',
    ];
    if (s.computadoras.length > 0) {
        lineas.push('', 'Computadoras:');
        for (const c of s.computadoras) {
            const seg = c.segundos === null ? null : c.segundos + transcurrido;
            lineas.push(`  ${c.Computadora} (${c.Version ?? 's/v'}): ${formatTranscurrido(seg)}`);
        }
    }
    return lineas.join('\n');
}

function Recuadro({ s, transcurrido }: { s: Vista; transcurrido: number }) {
    const e = ESTILO[s.nivel];
    const parpadea = s.nivel === 'critico' || s.nivel === 'grave';
    return (
        <div
            title={detalle(s, transcurrido)}
            className={cn('relative overflow-hidden rounded-lg border px-2.5 pt-2 pb-2.5 cursor-default transition-transform hover:-translate-y-0.5', e.caja)}
        >
            <div className="flex items-center gap-1.5 min-w-0">
                <span className="relative flex w-2 h-2 shrink-0">
                    {parpadea && <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping', e.punto)} />}
                    <span className={cn('relative inline-flex w-2 h-2 rounded-full', e.punto)} />
                </span>
                <span className={cn('text-[10px] font-black uppercase tracking-wider truncate', e.nombre)}>{s.Sucursal}</span>
            </div>
            <p className={cn('text-lg font-extrabold tracking-tight leading-tight mt-1 tabular-nums', e.tiempo)}>
                {formatTranscurridoCorto(s.seg)}
            </p>
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/5 dark:bg-white/5">
                <div className={cn('h-full', e.barra, e.lleno)} />
            </div>
        </div>
    );
}

const GRID = 'grid gap-2 grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]';

export default function MonitorTransmisiones() {
    const [data, setData] = useState<TransmisionesResponse | null>(null);
    const [recibidoEn, setRecibidoEn] = useState(0);
    const [ahora, setAhora] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [cargando, setCargando] = useState(false);
    const [verInactivas, setVerInactivas] = useState(false);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const res = await fetch('/api/dashboard/transmisiones', { cache: 'no-store' });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'No se pudo consultar');
            const t = Date.now();
            setData(json as TransmisionesResponse);
            setRecibidoEn(t);
            setAhora(t);
            setError(null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'No se pudo consultar');
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        // Primera carga diferida al siguiente tic: el setState no corre dentro del efecto.
        const inicial = setTimeout(cargar, 0);
        const refresco = setInterval(cargar, REFRESCO_MS);
        const tic = setInterval(() => setAhora(Date.now()), TIC_MS);
        return () => { clearTimeout(inicial); clearInterval(refresco); clearInterval(tic); };
    }, [cargar]);

    // Lo que pasó desde que llegó la respuesta se suma a lo que midió la base.
    const transcurrido = recibidoEn ? Math.max(0, Math.round((ahora - recibidoEn) / 1000)) : 0;
    const vistas: Vista[] = ordenarPorUrgencia(
        (data?.sucursales ?? []).map(s => {
            const seg = s.segundos === null ? null : s.segundos + transcurrido;
            return { ...s, seg, segundos: seg, nivel: nivelTransmision(seg) };
        })
    );
    const activas = vistas.filter(v => v.nivel !== 'inactiva');
    const inactivas = vistas.filter(v => v.nivel === 'inactiva');
    const conteo = (n: NivelTransmision) => activas.filter(v => v.nivel === n).length;

    return (
        <section className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Radio size={16} className="text-indigo-500 dark:text-indigo-400" />
                    <h2 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Última transmisión</h2>
                    <span className="hidden sm:inline text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        · alerta pasados 15 min
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    {ORDEN_RESUMEN.filter(n => conteo(n) > 0).map(n => (
                        <span key={n} className={cn('px-1.5 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-wider', PASTILLA[n])}>
                            {conteo(n)} {ETIQUETA_NIVEL[n]}
                        </span>
                    ))}
                    <button
                        type="button"
                        onClick={cargar}
                        disabled={cargando}
                        title="Actualizar"
                        aria-label="Actualizar"
                        className="p-1.5 rounded-md text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={cn(cargando && 'animate-spin')} />
                    </button>
                </div>
            </div>

            {error && (
                <p className="mt-3 text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {error}{data ? ' · se muestra la última consulta' : ''}
                </p>
            )}

            {!data && !error && <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">Consultando sucursales…</p>}

            {activas.length > 0 && (
                <div className={cn('mt-3', GRID)}>
                    {activas.map(s => <Recuadro key={s.IdSucursal} s={s} transcurrido={transcurrido} />)}
                </div>
            )}

            {inactivas.length > 0 && (
                <div className="mt-2">
                    <button
                        type="button"
                        onClick={() => setVerInactivas(v => !v)}
                        className="flex items-center gap-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                    >
                        <ChevronDown size={12} className={cn('transition-transform', verInactivas && 'rotate-180')} />
                        {inactivas.length} sin transmitir en más de 7 días
                    </button>
                    {verInactivas && (
                        <div className={cn('mt-2', GRID)}>
                            {inactivas.map(s => <Recuadro key={s.IdSucursal} s={s} transcurrido={transcurrido} />)}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
