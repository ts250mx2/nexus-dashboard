/**
 * Filtros y totales del lado del cliente para el tablero de existencias.
 * La lista completa de la sucursal ya viene del servidor; aquí solo se filtra
 * y se totaliza. Funciones puras: no tocan la red ni el DOM.
 */

import type { ExistenciaRow } from './existencias';

/** Palabras máximas que se toman en cuenta de la búsqueda. */
const MAX_TOKENS = 6;

const num = (v: unknown) => Number(v || 0);

/** Mayúsculas sin acentos, para comparar como lo hace el ERP (LIKE insensible). */
function normalizar(texto: string): string {
    return texto
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase();
}

/**
 * Divide la búsqueda en palabras normalizadas. Cada palabra debe aparecer en el
 * artículo (en cualquier campo), igual que hace el buscador del ERP:
 * "cinta morad" encuentra "CINTA ARTES MARCIALES ... MORADO CH".
 */
export function parseSearchTokens(raw: string): string[] {
    return normalizar(raw.trim().slice(0, 80))
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, MAX_TOKENS);
}

/** Verdadero si todas las palabras aparecen en código, descripción, producto o marca. */
export function coincideBusqueda(row: ExistenciaRow, tokens: string[]): boolean {
    if (tokens.length === 0) return true;
    const texto = normalizar(`${row.Codigo} ${row.Descripcion} ${row.Producto} ${row.Marca}`);
    return tokens.every(t => texto.includes(t));
}

function tieneMovimiento(r: ExistenciaRow): boolean {
    return num(r.ExiFinal) !== 0 || num(r.Entradas) !== 0 || num(r.Salidas) !== 0;
}

/** Verdadero si el artículo tuvo alguna entrada o salida con fecha de hoy. */
export function tieneMovimientoHoy(r: ExistenciaRow): boolean {
    return num(r.EntradasHoy) > 0 || num(r.SalidasHoy) > 0;
}

/** Verdadero si la existencia final quedó por debajo de cero. */
export function estaEnNegativo(r: ExistenciaRow): boolean {
    return num(r.ExiFinal) < 0;
}

export interface OpcionesVista {
    /** Oculta artículos con existencia final cero y sin movimientos posteriores al corte. */
    ocultarSinMovimiento: boolean;
    /** Deja solo los artículos con entradas o salidas de hoy. */
    soloMovimientosHoy: boolean;
    /** Deja solo los artículos con existencia final negativa. */
    soloNegativos: boolean;
}

/** Filas visibles según la búsqueda y los interruptores. */
export function armarVista(
    rows: ExistenciaRow[],
    search: string,
    opciones: OpcionesVista
): ExistenciaRow[] {
    const tokens = parseSearchTokens(search);
    return rows.filter(r =>
        coincideBusqueda(r, tokens)
        && (!opciones.ocultarSinMovimiento || tieneMovimiento(r))
        && (!opciones.soloMovimientosHoy || tieneMovimientoHoy(r))
        && (!opciones.soloNegativos || estaEnNegativo(r))
    );
}

export interface ExistenciasTotales {
    registros: number;
    conExistencia: number;
    conMovimientoHoy: number;
    negativos: number;
    exiInicial: number;
    entradas: number;
    salidas: number;
    entradasHoy: number;
    salidasHoy: number;
    exiFinal: number;
    total: number;
}

const TOTALES_VACIOS: ExistenciasTotales = {
    registros: 0,
    conExistencia: 0,
    conMovimientoHoy: 0,
    negativos: 0,
    exiInicial: 0,
    entradas: 0,
    salidas: 0,
    entradasHoy: 0,
    salidasHoy: 0,
    exiFinal: 0,
    total: 0,
};

/** Totales de las filas visibles. */
export function totalizar(rows: ExistenciaRow[]): ExistenciasTotales {
    return rows.reduce<ExistenciasTotales>(
        (acc, r) => ({
            registros: acc.registros + 1,
            conExistencia: acc.conExistencia + (num(r.ExiFinal) > 0 ? 1 : 0),
            conMovimientoHoy: acc.conMovimientoHoy + (tieneMovimientoHoy(r) ? 1 : 0),
            negativos: acc.negativos + (num(r.ExiFinal) < 0 ? 1 : 0),
            exiInicial: acc.exiInicial + num(r.ExiInicial),
            entradas: acc.entradas + num(r.Entradas),
            salidas: acc.salidas + num(r.Salidas),
            entradasHoy: acc.entradasHoy + num(r.EntradasHoy),
            salidasHoy: acc.salidasHoy + num(r.SalidasHoy),
            exiFinal: acc.exiFinal + num(r.ExiFinal),
            total: acc.total + num(r.Total),
        }),
        TOTALES_VACIOS
    );
}
