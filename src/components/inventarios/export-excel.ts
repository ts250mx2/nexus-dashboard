import {
    FORMAT_CURRENCY,
    FORMAT_INT,
    SheetColumn,
    buildFormattedSheet,
    downloadXLSX,
    safeFileName,
} from '@/lib/excel-helpers';

/** Una hoja del libro, con su propio título, metadata y tabla. */
export interface HojaExcel {
    /** Nombre de la pestaña. Se recorta y se hace único al generar el archivo. */
    nombre: string;
    titulo: string;
    meta?: { label: string; value: string }[];
    columnas: SheetColumn[];
    filas: Record<string, unknown>[];
    totales?: { label: string; values: Record<string, unknown> };
}

/** Descarga un libro con varias hojas, todas con el formato estándar del portal. */
export function exportarExcelMultihoja(opts: { archivo: string; hojas: HojaExcel[] }): void {
    const sheets = opts.hojas.map(hoja => ({
        name: hoja.nombre,
        ws: buildFormattedSheet({
            title: hoja.titulo,
            meta: hoja.meta ?? [],
            columns: hoja.columnas,
            rows: hoja.filas,
            totalRow: hoja.totales,
        }),
    }));
    const fecha = new Date().toISOString().slice(0, 10);
    downloadXLSX(`${safeFileName(opts.archivo)}_${fecha}.xlsx`, sheets);
}

/** Descarga una hoja con el formato estándar del portal. */
export function exportarExcel(opts: {
    archivo: string;
    hoja: string;
    titulo: string;
    meta?: { label: string; value: string }[];
    columnas: SheetColumn[];
    filas: Record<string, unknown>[];
    totales?: { label: string; values: Record<string, unknown> };
}): void {
    exportarExcelMultihoja({
        archivo: opts.archivo,
        hojas: [{
            nombre: opts.hoja,
            titulo: opts.titulo,
            meta: opts.meta,
            columnas: opts.columnas,
            filas: opts.filas,
            totales: opts.totales,
        }],
    });
}

/** Columna de moneda con el formato contable del portal. */
export function colMoneda(header: string, key: string, width = 16): SheetColumn {
    return { header, key, width, align: 'right', isCurrency: true, format: FORMAT_CURRENCY };
}

/** Columna numérica entera. */
export function colNumero(header: string, key: string, width = 12): SheetColumn {
    return { header, key, width, align: 'right', isNumber: true, format: FORMAT_INT };
}

/** Columna numérica con dos decimales, para promedios y tasas. */
export function colDecimal(header: string, key: string, width = 14): SheetColumn {
    return { header, key, width, align: 'right', isNumber: true, format: '#,##0.00' };
}

/** Columna de texto. */
export function colTexto(header: string, key: string, width = 22): SheetColumn {
    return { header, key, width, align: 'left' };
}

/** Etiqueta legible de las sucursales seleccionadas para el encabezado del archivo. */
export function etiquetaSucursales(
    seleccionadas: string[],
    catalogo: { IdSucursal: number; Sucursal: string }[]
): string {
    if (seleccionadas.length === 0) return 'Todas las sucursales';
    const nombres = catalogo
        .filter(s => seleccionadas.includes(String(s.IdSucursal)))
        .map(s => s.Sucursal);
    return nombres.length ? nombres.join(', ') : 'Todas las sucursales';
}
