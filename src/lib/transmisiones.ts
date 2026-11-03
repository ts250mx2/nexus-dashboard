/**
 * Monitor de la ÚLTIMA TRANSMISIÓN de cada sucursal al servidor central.
 *
 * Cálculos puros (sin red ni DOM): nivel de alerta según el tiempo sin
 * transmitir, cuál de las dos señales es la más reciente y cómo se escribe el
 * tiempo transcurrido. No importa nada en tiempo de ejecución a propósito: así
 * se prueba directo con `node --test` (ver tests/lib/transmisiones.test.mjs).
 *
 * Hay dos señales porque ninguna sola alcanza:
 *   - tblSucursalesTransmisiones: el registro que deja cada computadora al
 *     transmitir. Hay sucursales que mandan tickets sin actualizarlo (SATELITE
 *     llevaba días sin registro con tickets llegando ese mismo día).
 *   - FechaAct del último ticket recibido: cuándo llegó al servidor un documento
 *     de la sucursal (el ticket NXL-T-3652 llegó un día después de hecho).
 * La última transmisión es la más reciente de las dos.
 */

export type NivelTransmision = 'ok' | 'atencion' | 'alerta' | 'grave' | 'critico' | 'inactiva';
export type FuenteSenal = 'transmision' | 'ticket';

const MIN = 60;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/**
 * Hasta dónde llega cada nivel, en segundos. Pasados 15 minutos empieza la
 * alerta y sube conforme pasa el tiempo. Más de 7 días ya no es una alerta del
 * día sino una sucursal sin operación (bodegas viejas, sucursal de prueba).
 */
export const UMBRALES: ReadonlyArray<{ nivel: NivelTransmision; hasta: number }> = [
    { nivel: 'ok', hasta: 15 * MIN },
    { nivel: 'atencion', hasta: 30 * MIN },
    { nivel: 'alerta', hasta: HORA },
    { nivel: 'grave', hasta: 4 * HORA },
    { nivel: 'critico', hasta: 7 * DIA },
];

export const ETIQUETA_NIVEL: Readonly<Record<NivelTransmision, string>> = {
    ok: 'Al día',
    atencion: 'Atención',
    alerta: 'Alerta',
    grave: 'Grave',
    critico: 'Crítico',
    inactiva: 'Sin actividad',
};

export function nivelTransmision(segundos: number | null): NivelTransmision {
    if (segundos === null || !Number.isFinite(segundos)) return 'inactiva';
    return UMBRALES.find(u => segundos <= u.hasta)?.nivel ?? 'inactiva';
}

export function formatTranscurrido(segundos: number | null): string {
    if (segundos === null || !Number.isFinite(segundos)) return 'sin registro';
    const s = Math.max(0, Math.floor(segundos));
    if (s < MIN) return 'hace menos de 1 min';
    if (s < HORA) return `hace ${Math.floor(s / MIN)} min`;
    if (s < DIA) {
        const h = Math.floor(s / HORA);
        const m = Math.floor((s % HORA) / MIN);
        return m > 0 ? `hace ${h} h ${m} min` : `hace ${h} h`;
    }
    const d = Math.floor(s / DIA);
    const h = Math.floor((s % DIA) / HORA);
    return h > 0 ? `hace ${d} d ${h} h` : `hace ${d} d`;
}

/** Versión corta para un recuadro chico: '<1m', '4m', '3h 32m', '5d 10h'. */
export function formatTranscurridoCorto(segundos: number | null): string {
    if (segundos === null || !Number.isFinite(segundos)) return '—';
    const s = Math.max(0, Math.floor(segundos));
    if (s < MIN) return '<1m';
    if (s < HORA) return `${Math.floor(s / MIN)}m`;
    const [mayor, unidadMayor, resto, unidadResto] = s < DIA
        ? [Math.floor(s / HORA), 'h', Math.floor((s % HORA) / MIN), 'm']
        : [Math.floor(s / DIA), 'd', Math.floor((s % DIA) / HORA), 'h'];
    return resto > 0 ? `${mayor}${unidadMayor} ${resto}${unidadResto}` : `${mayor}${unidadMayor}`;
}

/** La más reciente de las dos señales (fechas ISO 8601) y de cuál salió. */
export function ultimaSenal(senales: { transmision: string | null; ticket: string | null }): {
    fecha: string | null;
    fuente: FuenteSenal | null;
} {
    const t = senales.transmision ? Date.parse(senales.transmision) : NaN;
    const v = senales.ticket ? Date.parse(senales.ticket) : NaN;
    if (Number.isNaN(t) && Number.isNaN(v)) return { fecha: null, fuente: null };
    if (Number.isNaN(v) || (!Number.isNaN(t) && t >= v)) return { fecha: senales.transmision, fuente: 'transmision' };
    return { fecha: senales.ticket, fuente: 'ticket' };
}

/** La que lleva más tiempo sin transmitir primero; las que no tienen señal al final. */
export function ordenarPorUrgencia<T extends { segundos: number | null }>(filas: readonly T[]): T[] {
    return [...filas].sort((a, b) => (b.segundos ?? -1) - (a.segundos ?? -1));
}
