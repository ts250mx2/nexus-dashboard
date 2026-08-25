import {
    FORMAT_CURRENCY,
    FORMAT_INT,
    SheetColumn,
    buildFormattedSheet,
    downloadXLSX,
    safeFileName,
} from '@/lib/excel-helpers';

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
    const ws = buildFormattedSheet({
        title: opts.titulo,
        meta: opts.meta ?? [],
        columns: opts.columnas,
        rows: opts.filas,
        totalRow: opts.totales,
    });
    const fecha = new Date().toISOString().slice(0, 10);
    downloadXLSX(`${safeFileName(opts.archivo)}_${fecha}.xlsx`, [{ name: opts.hoja, ws }]);
}

/** Columna de moneda con el formato contable del portal. */
export function colMoneda(header: string, key: string, width = 16): SheetColumn {
    return { header, key, width, align: 'right', isCurrency: true, format: FORMAT_CURRENCY };
}

/** Columna numérica entera. */
export function colNumero(header: string, key: string, width = 12): SheetColumn {
    return { header, key, width, align: 'right', isNumber: true, format: FORMAT_INT };
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
