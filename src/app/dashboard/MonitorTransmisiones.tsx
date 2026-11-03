'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    ChevronDown,
    CircleCheck,
    Clock3,
    LucideIcon,
    MoonStar,
    OctagonAlert,
    Radio,
    Receipt,
    RefreshCw,
    Siren,
    TriangleAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatHora } from '@/lib/format';
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

/** Niveles de menor a mayor: el medidor se llena hasta el nivel actual. */
const ESCALA: NivelTransmision[] = ['ok', 'atencion', 'alerta', 'grave', 'critico'];
const UMBRAL_TEXTO = 'Al día hasta 15 min · Atención 15-30 min · Alerta 30-60 min · Grave 1-4 h · Crítico más de 4 h';

interface Estilo {
    icono: LucideIcon;
    caja: string;
    tiempo: string;
    texto: string;
    tenue: string;
    pastilla: string;
    segmento: string;
    segmentoVacio: string;
    punto: string;
}

/**
 * Entre más tiempo sin transmitir, más intenso el recuadro. El crítico va en
 * rojo sólido para que se vea desde lejos; ahí todo el texto pasa a claro.
 */
const ESTILO: Record<NivelTransmision, Estilo> = {
    ok: {
        icono: CircleCheck,
        caja: 'bg-white border-emerald-200 dark:bg-slate-900 dark:border-emerald-900/60',
        tiempo: 'text-emerald-600 dark:text-emerald-400',
        texto: 'text-slate-700 dark:text-slate-200',
        tenue: 'text-slate-400 dark:text-slate-500',
        pastilla: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/60',
        segmento: 'bg-emerald-500',
        segmentoVacio: 'bg-slate-200 dark:bg-slate-700',
        punto: 'bg-emerald-500',
    },
    atencion: {
        icono: Clock3,
        caja: 'bg-amber-50/70 border-amber-300 dark:bg-amber-950/25 dark:border-amber-800/60',
        tiempo: 'text-amber-600 dark:text-amber-400',
        texto: 'text-slate-700 dark:text-slate-200',
        tenue: 'text-amber-900/50 dark:text-amber-200/50',
        pastilla: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60',
        segmento: 'bg-amber-400',
        segmentoVacio: 'bg-amber-200/60 dark:bg-amber-900/40',
        punto: 'bg-amber-400',
    },
    alerta: {
        icono: TriangleAlert,
        caja: 'bg-orange-50 border-orange-300 dark:bg-orange-950/35 dark:border-orange-800/60',
        tiempo: 'text-orange-600 dark:text-orange-400',
        texto: 'text-orange-950/80 dark:text-orange-100',
        tenue: 'text-orange-900/50 dark:text-orange-200/50',
        pastilla: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800/60',
        segmento: 'bg-orange-500',
        segmentoVacio: 'bg-orange-200/60 dark:bg-orange-900/40',
        punto: 'bg-orange-500',
    },
    grave: {
        icono: OctagonAlert,
        caja: 'bg-rose-50 border-rose-300 dark:bg-rose-950/40 dark:border-rose-800/60',
        tiempo: 'text-rose-600 dark:text-rose-400',
        texto: 'text-rose-950/80 dark:text-rose-100',
        tenue: 'text-rose-900/50 dark:text-rose-200/50',
        pastilla: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60',
        segmento: 'bg-rose-500',
        segmentoVacio: 'bg-rose-200/60 dark:bg-rose-900/40',
        punto: 'bg-rose-500',
    },
    critico: {
        icono: Siren,
        caja: 'bg-gradient-to-br from-rose-600 to-rose-700 border-rose-700 shadow-md shadow-rose-500/30 dark:border-rose-500',
        tiempo: 'text-white',
        texto: 'text-rose-50',
        tenue: 'text-rose-100/70',
        pastilla: 'bg-white/15 text-white border-white/30',
        segmento: 'bg-white',
        segmentoVacio: 'bg-white/25',
        punto: 'bg-white',
    },
    inactiva: {
        icono: MoonStar,
        caja: 'bg-slate-50 border-slate-200 dark:bg-slate-900/60 dark:border-slate-700',
        tiempo: 'text-slate-400 dark:text-slate-500',
        texto: 'text-slate-500 dark:text-slate-400',
        tenue: 'text-slate-400 dark:text-slate-500',
        pastilla: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
        segmento: 'bg-slate-300 dark:bg-slate-600',
        segmentoVacio: 'bg-slate-200 dark:bg-slate-700',
        punto: 'bg-slate-300 dark:bg-slate-600',
    },
};

const ORDEN_RESUMEN: NivelTransmision[] = ['critico', 'grave', 'alerta', 'atencion', 'ok'];

type Vista = SucursalTransmision & { seg: number | null; nivel: NivelTransmision };

/** Hora si fue hoy; si no, día y hora. */
function cuando(iso: string | null, ahora: number): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    if (d.toDateString() === new Date(ahora).toDateString()) return formatHora(d);
    return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function Senal({ icono: Icono, etiqueta, iso, ahora, activa, e }: {
    icono: LucideIcon; etiqueta: string; iso: string | null; ahora: number; activa: boolean; e: Estilo;
}) {
    return (
        <div className={cn('flex items-center gap-1.5 text-[11px]', activa ? e.texto : e.tenue)}>
            <Icono size={12} className="shrink-0" />
            <span className="truncate">{etiqueta}</span>
            <span className={cn('ml-auto tabular-nums whitespace-nowrap', activa && 'font-bold')}>{cuando(iso, ahora)}</span>
        </div>
    );
}

function Recuadro({ s, ahora }: { s: Vista; ahora: number }) {
    const e = ESTILO[s.nivel];
    const Icono = e.icono;
    const nivelIdx = ESCALA.indexOf(s.nivel);

    return (
        <div className={cn('relative rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-md', e.caja)}>
            <div className="flex items-start justify-between gap-2">
                <span className={cn('text-[11px] font-black uppercase tracking-wider truncate', e.texto)} title={s.Sucursal}>
                    {s.Sucursal}
                </span>
                <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-wider whitespace-nowrap', e.pastilla)}>
                    <Icono size={10} className={cn((s.nivel === 'critico' || s.nivel === 'grave') && 'animate-pulse')} />
                    {ETIQUETA_NIVEL[s.nivel]}
                </span>
            </div>

            <div className="mt-1.5 flex items-baseline gap-1.5" title={s.ultima ? formatTranscurrido(s.seg) : undefined}>
                <span className={cn('text-2xl font-extrabold tracking-tight tabular-nums leading-none', e.tiempo)}>
                    {formatTranscurridoCorto(s.seg)}
                </span>
                <span className={cn('text-[10px] font-semibold', e.tenue)}>{s.ultima ? 'sin transmitir' : 'sin registro'}</span>
            </div>

            {/* Medidor: en qué umbral va. */}
            <div className="mt-2 flex gap-0.5" title={UMBRAL_TEXTO}>
                {ESCALA.map((n, i) => (
                    <span key={n} className={cn('h-1.5 flex-1 rounded-full', i <= nivelIdx ? e.segmento : e.segmentoVacio)} />
                ))}
            </div>

            <div className="mt-2.5 space-y-1">
                <Senal icono={Radio} etiqueta="Transmisión" iso={s.ultimaTransmision} ahora={ahora} activa={s.fuente === 'transmision'} e={e} />
                <Senal icono={Receipt} etiqueta="Último ticket" iso={s.ultimoTicket} ahora={ahora} activa={s.fuente === 'ticket'} e={e} />
            </div>
        </div>
    );
}

const GRID = 'grid gap-3 grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]';

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
    const enAlerta = activas.length - conteo('ok');

    return (
        <section className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                    <div className={cn(
                        'flex items-center justify-center w-8 h-8 rounded-lg border',
                        enAlerta > 0
                            ? 'bg-rose-500/10 text-rose-500 border-rose-500/20 dark:text-rose-400'
                            : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 dark:text-emerald-400'
                    )}>
                        <Radio size={16} />
                    </div>
                    <div>
                        <h2 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Última transmisión</h2>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                            {data
                                ? enAlerta > 0
                                    ? `${enAlerta} de ${activas.length} sucursales con atraso`
                                    : `Las ${activas.length} sucursales al día`
                                : 'Alerta pasados 15 min sin transmitir'}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    {ORDEN_RESUMEN.filter(n => conteo(n) > 0).map(n => {
                        const Icono = ESTILO[n].icono;
                        return (
                            <span
                                key={n}
                                className={cn(
                                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-wider',
                                    n === 'critico' ? 'bg-rose-600 text-white border-rose-700' : ESTILO[n].pastilla
                                )}
                            >
                                <Icono size={10} />
                                {conteo(n)} {ETIQUETA_NIVEL[n]}
                            </span>
                        );
                    })}
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
                    {activas.map(s => <Recuadro key={s.IdSucursal} s={s} ahora={ahora} />)}
                </div>
            )}

            {data && (
                <div className={cn('mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]', 'text-slate-400 dark:text-slate-500')}>
                    <span className="inline-flex items-center gap-1"><Radio size={11} /> registro de transmisión de las computadoras</span>
                    <span className="inline-flex items-center gap-1"><Receipt size={11} /> llegada del último ticket al servidor</span>
                    <span>en negritas, la señal más reciente</span>
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
                            {inactivas.map(s => <Recuadro key={s.IdSucursal} s={s} ahora={ahora} />)}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
