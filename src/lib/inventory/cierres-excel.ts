/**
 * Reporte del cierre de inventario en Excel: una hoja de resumen y una hoja por
 * sucursal con la última transición. Se arma en memoria (Buffer) para
 * adjuntarlo al correo o guardarlo en disco.
 */

import XLSX from 'xlsx-js-style';
import { buildFormattedSheet, sheetName, type SheetColumn } from '@/lib/excel-helpers';
import type { Comparacion } from './cierres-comparar';
import type { ResultadoCierre } from './cierres';
import { filasReporte, filasResumen, resumenComparacion } from './cierres-reporte';

const COLUMNAS_DETALLE: SheetColumn[] = [
    { header: 'Código', key: 'Codigo', width: 14 },
    { header: 'Descripción', key: 'Descripcion', width: 44 },
    { header: 'Marca', key: 'Marca', width: 16 },
    { header: 'Depto', key: 'Depto', width: 16 },
    { header: 'Costo', key: 'Costo', width: 12, isCurrency: true },
    { header: 'Cierre anterior', key: 'CierreAnterior', width: 12, align: 'right' },
    { header: 'Corte ERP', key: 'CorteERP', width: 12, align: 'right' },
    { header: 'Entradas', key: 'Entradas', width: 11, isNumber: true },
    { header: 'Salidas', key: 'Salidas', width: 11, isNumber: true },
    { header: 'Cierre hoy', key: 'CierreHoy', width: 12, align: 'right' },
    { header: 'Diferencia', key: 'Diferencia', width: 12, align: 'right' },
    { header: 'Valor dif.', key: 'ValorDiferencia', width: 14, align: 'right', format: '"$"#,##0.00;[Red]-"$"#,##0.00' },
    { header: 'Estado', key: 'Estado', width: 14 },
];

const COLUMNAS_RESUMEN: SheetColumn[] = [
    { header: 'Sucursal', key: 'Sucursal', width: 24 },
    { header: 'Fecha', key: 'Fecha', width: 12 },
    { header: 'Guardado', key: 'Guardado', width: 10, align: 'center' },
    { header: 'Artículos', key: 'Articulos', width: 11, isNumber: true },
    { header: 'Unidades', key: 'Unidades', width: 12, isNumber: true },
    { header: 'Valor', key: 'Valor', width: 16, isCurrency: true },
    { header: 'Negativos', key: 'Negativos', width: 11, isNumber: true },
    { header: 'Cuadran', key: 'Cuadran', width: 10, isNumber: true },
    { header: 'Con diferencia', key: 'ConDiferencia', width: 12, isNumber: true },
    { header: 'Sin verificar', key: 'SinVerificar', width: 12, isNumber: true },
    { header: 'Unid. diferencia', key: 'UnidadesDiferencia', width: 13, isNumber: true },
    { header: 'Valor diferencia', key: 'ValorDiferencia', width: 16, isCurrency: true },
    { header: 'Observaciones', key: 'Observaciones', width: 50 },
];

/** Libro completo: Resumen + una hoja por sucursal guardada. */
export function construirExcelCierre(resultado: ResultadoCierre, comparaciones: Map<number, Comparacion>): Buffer {
    const wb = XLSX.utils.book_new();
    const usados = new Set<string>();
    const resumen = filasResumen(resultado, comparaciones);

    XLSX.utils.book_append_sheet(wb, buildFormattedSheet({
        title: `CIERRE DE INVENTARIO · ${resultado.fecha}`,
        meta: [
            { label: 'Generado', value: new Date(resultado.generadoEn).toLocaleString('es-MX') },
            { label: 'Sucursales', value: `${resumen.filter(f => f.Guardado === 'Sí').length} de ${resumen.length} guardadas` },
        ],
        columns: COLUMNAS_RESUMEN,
        rows: resumen,
    }), sheetName('Resumen', usados));

    for (const s of resultado.sucursales) {
        const comp = comparaciones.get(s.IdSucursal);
        if (!s.ok || !comp) continue;
        const r = resumenComparacion(comp);
        XLSX.utils.book_append_sheet(wb, buildFormattedSheet({
            title: `${s.Sucursal} · CIERRE ${s.fecha}`,
            meta: [
                { label: 'Comparado contra', value: r.anterior ? `Cierre del ${r.anterior}` : 'Sin cierre anterior' },
                { label: 'Resultado', value: `${r.cuadran} cuadran · ${r.conDiferencia} con diferencia · ${r.sinVerificar} sin verificar` },
            ],
            columns: COLUMNAS_DETALLE,
            rows: filasReporte(comp),
        }), sheetName(s.Sucursal, usados));
    }

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}
