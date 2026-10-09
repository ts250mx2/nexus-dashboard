/**
 * Renglones del reporte del cierre de inventario: la última transición de cada
 * sucursal (cierre anterior → cierre recién tomado) y el resumen por sucursal.
 * Lógica pura: no toca la base, el disco ni el formato del Excel.
 */

import type { Comparacion, EstadoTransicion } from './cierres-comparar';
import type { ResultadoCierre } from './cierres';

export interface FilaReporte {
    Codigo: string;
    Descripcion: string;
    Marca: string;
    Depto: string;
    Costo: number;
    CierreAnterior: number | '';
    CorteERP: number | '';
    Entradas: number;
    Salidas: number;
    CierreHoy: number | '';
    Diferencia: number | '';
    ValorDiferencia: number | '';
    Estado: string;
}

export interface ResumenComparacion {
    /** Fecha del cierre anterior contra el que se verificó (null si es el primero). */
    anterior: string | null;
    corteRenovado: boolean;
    cuadran: number;
    conDiferencia: number;
    sinVerificar: number;
    unidadesDiferencia: number;
    valorDiferencia: number;
}

const ETIQUETA_ESTADO: Record<EstadoTransicion, string> = {
    diferencia: 'Diferencia',
    cuadra: 'Cuadra',
    conteo: 'Conteo físico',
    sin_verificacion: 'Sin verificar',
    sin_dato: 'Sin dato',
};

const ORDEN_ESTADO: Record<EstadoTransicion, number> = {
    diferencia: 0, conteo: 1, sin_verificacion: 2, sin_dato: 3, cuadra: 4,
};

/**
 * Renglones de la última transición: existencia final del cierre anterior,
 * corte del ERP con que abrió el último, sus movimientos y su existencia final.
 * Las diferencias van primero; dentro de cada estado, por descripción.
 */
export function filasReporte(comp: Comparacion): FilaReporte[] {
    const n = comp.columnas.length;
    if (n === 0) return [];
    const iUlt = n - 1;
    const iAnt = n >= 2 ? n - 2 : -1;

    return comp.filas
        .map(f => {
            const ult = f.celdas[iUlt];
            const ant = iAnt >= 0 ? f.celdas[iAnt] : null;
            const dif = ult.diferencia;
            return {
                estado: ult.estado,
                fila: {
                    Codigo: f.Codigo,
                    Descripcion: f.Descripcion,
                    Marca: f.Marca,
                    Depto: f.Depto,
                    Costo: f.Costo,
                    CierreAnterior: ant?.exiFinal ?? '',
                    CorteERP: ult.exiInicial ?? '',
                    Entradas: ult.entradas,
                    Salidas: ult.salidas,
                    CierreHoy: ult.exiFinal ?? '',
                    Diferencia: dif ?? '',
                    ValorDiferencia: dif === null ? '' : dif * f.Costo,
                    Estado: ETIQUETA_ESTADO[ult.estado],
                } as FilaReporte,
            };
        })
        .sort((a, b) =>
            ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] ||
            a.fila.Descripcion.localeCompare(b.fila.Descripcion, 'es-MX')
        )
        .map(x => x.fila);
}

/** Totales de la última transición de una sucursal. */
export function resumenComparacion(comp: Comparacion): ResumenComparacion {
    const n = comp.columnas.length;
    const vacio: ResumenComparacion = {
        anterior: null, corteRenovado: false, cuadran: 0, conDiferencia: 0,
        sinVerificar: comp.filas.length, unidadesDiferencia: 0, valorDiferencia: 0,
    };
    if (n < 2) return vacio;

    const i = n - 1;
    const t = comp.transiciones[i - 1];
    const valor = comp.filas.reduce((acc, f) => acc + Math.abs(f.celdas[i].diferencia ?? 0) * f.Costo, 0);
    return {
        anterior: comp.columnas[i - 1].fecha,
        corteRenovado: t.corteRenovado,
        cuadran: t.cuadran,
        conDiferencia: t.conDiferencia,
        sinVerificar: comp.filas.length - t.comparados,
        unidadesDiferencia: t.unidadesDiferencia,
        valorDiferencia: valor,
    };
}

function observacion(ok: boolean, error: string | undefined, conservado: boolean | undefined, r: ResumenComparacion | undefined): string {
    if (!ok) return conservado ? `Falló; se conservó el cierre anterior del día. ${error ?? ''}` : `Falló: ${error ?? ''}`;
    if (!r?.anterior) return 'Primer cierre: no hay cierre anterior para comparar.';
    if (!r.corteRenovado) return `Sin verificación: el ERP no generó un corte inmediato al cierre del ${r.anterior}.`;
    return `Comparado contra el cierre del ${r.anterior}.`;
}

export interface FilaResumen {
    Sucursal: string;
    Fecha: string;
    Guardado: string;
    Articulos: number;
    Unidades: number;
    Valor: number;
    Negativos: number;
    Cuadran: number;
    ConDiferencia: number;
    SinVerificar: number;
    UnidadesDiferencia: number;
    ValorDiferencia: number;
    Observaciones: string;
}

/** Un renglón por sucursal del cierre, con su verificación contra el anterior. */
export function filasResumen(resultado: ResultadoCierre, comparaciones: Map<number, Comparacion>): FilaResumen[] {
    return resultado.sucursales.map(s => {
        const comp = comparaciones.get(s.IdSucursal);
        const r = comp ? resumenComparacion(comp) : undefined;
        return {
            Sucursal: s.Sucursal,
            Fecha: s.fecha,
            Guardado: s.ok ? 'Sí' : 'No',
            Articulos: s.articulos,
            Unidades: s.unidades,
            Valor: s.valor,
            Negativos: s.negativos,
            Cuadran: r?.cuadran ?? 0,
            ConDiferencia: r?.conDiferencia ?? 0,
            SinVerificar: r?.sinVerificar ?? 0,
            UnidadesDiferencia: r?.unidadesDiferencia ?? 0,
            ValorDiferencia: r?.valorDiferencia ?? 0,
            Observaciones: observacion(s.ok, s.error, s.conservadoAnterior, r),
        };
    });
}
