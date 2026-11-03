'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Radio, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import {
    ETIQUETA_NIVEL,
    NivelTransmision,
    formatTranscurrido,
    nivelTransmision,
    ordenarPorUrgencia,
} from '@/lib/transmisiones';
import type { SucursalTransmision, TransmisionesResponse } from '@/app/api/dashboard/transmisiones/route';

/** Cada cuánto se vuelve a pedir al servidor (que a su vez guarda 60 s en caché). */
const REFRESCO_MS = 60_000;
/** Cada cuánto avanza el "hace X min" en pantalla entre una consulta y otra. */
const TIC_MS = 15_000;
/** Computadoras que se muestran por tarjeta; el resto va en el título. */
const MAX_COMPUTADORAS = 3;

/** Entre más tiempo sin transmitir, más intensa la tarjeta. */
const ESTILO: Record<NivelTransmision, { tarjeta: string; texto: string; pastilla: string; punto: string }> = {
    ok: {
        tarjeta: 'border-l-emerald-500 bg-white dark:bg-slate-900',
        texto: 'text-emerald-600 dark:text-emerald-400',
        pastilla: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/60',
        punto: 'bg-emerald-500',
    },
    atencion: {
        tarjeta: 'border-l-amber-400 bg-amber-50/50 dark:bg-amber-950/20',
        texto: 'text-amber-600 dark:text-amber-400',
        pastilla: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/60',
        punto: 'bg-amber-400',
    },
    alerta: {
        tarjeta: 'border-l-orange-500 bg-orange-50/70 dark:bg-orange-950/30',
        texto: 'text-orange-600 dark:text-orange-400',
        pastilla: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800/60',
        punto: 'bg-orange-500',
    },
    grave: {
        tarjeta: 'border-l-rose-500 bg-rose-50 dark:bg-rose-950/30',
        texto: 'text-rose-600 dark:text-rose-400',
        pastilla: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/60',
        punto: 'bg-rose-500',
    },
    critico: {
        tarjeta: 'border-l-rose-700 bg-rose-100 ring-2 ring-rose-500/60 dark:bg-rose-950/50 dark:ring-rose-500/50',
        texto: 'text-rose-700 dark:text-rose-300',
        pastilla: 'bg-rose-600 text-white border-rose-700 dark:bg-rose-600 dark:border-rose-500',
        punto: 'bg-rose-600',
    },
    inactiva: {
        tarjeta: 'border-l-slate-300 bg-slate-50 dark:border-l-slate-700 dark:bg-slate-900/60',
        texto: 'text-slate-500 dark:text-slate-400',
        pastilla: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
        punto: 'bg-slate-400',
    },
};

const ORDEN_RESUMEN: NivelTransmision[] = ['critico', 'grave', 'alerta', 'atencion', 'ok'];

const FUENTE: Record<string, string> = {
    transmision: 'registro de transmisión',
    ticket: 'último ticket recibido',
};

type Vista = SucursalTransmision & { seg: number | null; nivel: NivelTransmision };

function Tarjeta({ s, transcurrido }: { s: Vista; transcurrido: number }) {
    const e = ESTILO[s.nivel];
    const compus = s.computadoras.map(c => ({ ...c, seg: c.segundos === null ? null : c.segundos + transcurrido }));
    const titulo = compus.map(c => `${c.Computadora} (${c.Version ?? 's/v'}): ${formatTranscurrido(c.seg)}`).join('\n');
    return (
        <div className={cn('border border-slate-200/60 dark:border-slate-700/60 border-l-4 rounded-xl p-4 shadow-xs', e.tarjeta)}>
            <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider truncate" title={s.Sucursal}>
                    {s.Sucursal}
                </p>
                <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-wider whitespace-nowrap', e.pastilla)}>
                    <span className="relative flex w-1.5 h-1.5">
                        {(s.nivel === 'critico' || s.nivel === 'grave') && (
                            <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping', e.punto)} />
                        )}
                        <span className={cn('relative inline-flex w-1.5 h-1.5 rounded-full', s.nivel === 'critico' ? 'bg-white' : e.punto)} />
                    </span>
                    {ETIQUETA_NIVEL[s.nivel]}
                </span>
            </div>
            <p className={cn('text-2xl font-extrabold tracking-tight mt-2', e.texto)}>{formatTranscurrido(s.seg)}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {s.ultima ? (
                    <>
                        {formatDateTime(s.ultima)}
                        {s.fuente && <span className="text-slate-400 dark:text-slate-500"> · {FUENTE[s.fuente]}</span>}
                    </>
                ) : 'Nunca ha transmitido'}
            </p>
            {compus.length > 0 && (
                <ul className="mt-2 space-y-0.5" title={titulo}>
                    {compus.slice(0, MAX_COMPUTADORAS).map(c => (
                        <li key={c.Computadora} className="flex justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                            <span className="truncate font-semibold">{c.Computadora}</span>
                            <span className="whitespace-nowrap">{formatTranscurrido(c.seg)}</span>
                        </li>
                    ))}
                    {compus.length > MAX_COMPUTADORAS && (
                        <li className="text-[10px] text-slate-400 dark:text-slate-500">+{compus.length - MAX_COMPUTADORAS} más</li>
                    )}
                </ul>
            )}
        </div>
    );
}

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
        <section className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg border bg-indigo-500/10 text-indigo-500 border-indigo-500/20 dark:text-indigo-400">
                        <Radio size={18} />
                    </div>
                    <div>
                        <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Última transmisión</h2>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                            Alerta pasados 15 min sin transmitir · se actualiza cada minuto
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {ORDEN_RESUMEN.filter(n => conteo(n) > 0).map(n => (
                        <span key={n} className={cn('px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-wider', ESTILO[n].pastilla)}>
                            {conteo(n)} {ETIQUETA_NIVEL[n]}
                        </span>
                    ))}
                    <button
                        type="button"
                        onClick={cargar}
                        disabled={cargando}
                        title="Actualizar"
                        aria-label="Actualizar"
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={cn(cargando && 'animate-spin')} />
                    </button>
                </div>
            </div>

            {error && (
                <p className="mt-4 text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {error}{data ? ' · se muestra la última consulta' : ''}
                </p>
            )}

            {!data && !error && <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">Consultando sucursales…</p>}

            {activas.length > 0 && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {activas.map(s => <Tarjeta key={s.IdSucursal} s={s} transcurrido={transcurrido} />)}
                </div>
            )}

            {inactivas.length > 0 && (
                <div className="mt-4">
                    <button
                        type="button"
                        onClick={() => setVerInactivas(v => !v)}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                    >
                        <ChevronDown size={14} className={cn('transition-transform', verInactivas && 'rotate-180')} />
                        {inactivas.length} sin transmitir en más de 7 días
                    </button>
                    {verInactivas && (
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                            {inactivas.map(s => <Tarjeta key={s.IdSucursal} s={s} transcurrido={transcurrido} />)}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
