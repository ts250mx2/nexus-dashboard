'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '@/lib/errors';
import { formatTime } from '@/lib/format';

/**
 * Carga de un tablero de inventario: arma el query string, cancela la petición
 * anterior cuando cambian los filtros y expone estado de carga y error.
 *
 * La búsqueda de texto se retrasa para no disparar una consulta por tecla; el
 * resto de los filtros aplica de inmediato.
 *
 * El estado de carga se DERIVA comparando la consulta vigente contra la que
 * respondió el servidor, en lugar de escribirse dentro del efecto. Así el
 * resultado anterior sigue en pantalla mientras llega el nuevo y no se
 * encadenan renders innecesarios.
 */

const SEARCH_DEBOUNCE_MS = 450;

export type ReportParams = Record<string, string | number | boolean | undefined>;

interface ReportState<T> {
    /** Consulta que produjo este resultado. */
    key: string;
    data: T | null;
    error: string | null;
    at: string;
}

interface UseInventoryReportResult<T> {
    data: T | null;
    /** Primera carga: todavía no hay nada que mostrar. */
    loading: boolean;
    /** Hay una recarga en curso pero ya se muestran datos previos. */
    refreshing: boolean;
    error: string | null;
    lastUpdated: string;
    refresh: () => void;
}

export function useInventoryReport<T>(
    endpoint: string,
    params: ReportParams,
    /** Parámetro que debe esperar al debounce, normalmente la búsqueda. */
    debouncedKey?: string
): UseInventoryReportResult<T> {
    const [result, setResult] = useState<ReportState<T> | null>(null);
    const [reloadToken, setReloadToken] = useState(0);

    const rawValue = debouncedKey ? String(params[debouncedKey] ?? '') : '';
    const [debouncedValue, setDebouncedValue] = useState(rawValue);

    useEffect(() => {
        if (!debouncedKey) return;
        const id = setTimeout(() => setDebouncedValue(rawValue), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(id);
    }, [rawValue, debouncedKey]);

    // Las páginas arman `params` como objeto literal, así que su identidad cambia
    // en cada render. Se depende del contenido serializado, no de la referencia,
    // para no disparar un ciclo infinito de peticiones.
    const paramsKey = JSON.stringify(params);

    const queryString = useMemo(() => {
        const resolvedParams: ReportParams = JSON.parse(paramsKey);
        const search = new URLSearchParams();
        for (const [key, value] of Object.entries(resolvedParams)) {
            const resolved = debouncedKey && key === debouncedKey ? debouncedValue : value;
            if (resolved === undefined || resolved === '' || resolved === false) continue;
            search.set(key, String(resolved === true ? 1 : resolved));
        }
        return search.toString();
    }, [paramsKey, debouncedKey, debouncedValue]);

    const fetchKey = `${endpoint}?${queryString}#${reloadToken}`;

    useEffect(() => {
        const controller = new AbortController();

        fetch(`${endpoint}?${queryString}`, { signal: controller.signal })
            .then(async response => {
                const json = await response.json();
                if (!json.success) throw new Error(json.error || 'El servidor no pudo calcular el reporte');
                return json as T;
            })
            .then(json => {
                setResult({ key: fetchKey, data: json, error: null, at: formatTime() });
            })
            .catch((err: unknown) => {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                setResult(prev => ({
                    key: fetchKey,
                    // Se conserva el último resultado bueno para no dejar la pantalla en blanco.
                    data: prev?.data ?? null,
                    error: getErrorMessage(err, 'Error inesperado al consultar el inventario'),
                    at: prev?.at ?? '',
                }));
            });

        return () => controller.abort();
    }, [endpoint, queryString, fetchKey]);

    const pending = result?.key !== fetchKey;
    const data = result?.data ?? null;

    return {
        data,
        loading: pending && data === null,
        refreshing: pending && data !== null,
        error: pending ? null : result?.error ?? null,
        lastUpdated: result?.at ?? '',
        refresh: useCallback(() => setReloadToken(t => t + 1), []),
    };
}
