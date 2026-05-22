/**
 * Helpers para generar archivos Excel con formato (colores, bordes, anchos, etc.)
 * usando xlsx-js-style.
 *
 * Estilo general:
 *  - Título principal: combinado, fondo azul oscuro, texto blanco grande
 *  - Subtítulos/metadata: fondo azul claro, texto azul oscuro
 *  - Encabezado de tabla: fondo azul medio, texto blanco, negrita, centrado
 *  - Filas alternadas: gris muy claro vs blanco
 *  - Totales: fondo verde claro, negrita
 *  - Bordes sutiles en celdas de datos
 */

import XLSX from 'xlsx-js-style';

// Paleta corporativa Nexus
export const EXCEL_COLORS = {
    titleBg: '1E293B',     // slate-800
    titleText: 'FFFFFF',
    metaBg: 'E0E7FF',      // indigo-100
    metaText: '1E3A8A',    // indigo-900
    headerBg: '2563EB',    // blue-600
    headerText: 'FFFFFF',
    rowAltBg: 'F8FAFC',    // slate-50
    rowAltText: '0F172A',  // slate-900
    totalBg: 'D1FAE5',     // emerald-100
    totalText: '065F46',   // emerald-800
    borderColor: 'CBD5E1'  // slate-300
};

export const BORDER_THIN = {
    style: 'thin' as const,
    color: { rgb: EXCEL_COLORS.borderColor }
};

export const STYLE_TITLE = {
    font: { name: 'Calibri', sz: 16, bold: true, color: { rgb: EXCEL_COLORS.titleText } },
    fill: { fgColor: { rgb: EXCEL_COLORS.titleBg }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
};

export const STYLE_SUBTITLE = {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: EXCEL_COLORS.metaText } },
    fill: { fgColor: { rgb: EXCEL_COLORS.metaBg }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' }
};

export const STYLE_META_LABEL = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '475569' } },
    alignment: { horizontal: 'right', vertical: 'center' }
};

export const STYLE_META_VALUE = {
    font: { name: 'Calibri', sz: 10, bold: false, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'left', vertical: 'center' }
};

export const STYLE_HEADER = {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: EXCEL_COLORS.headerText } },
    fill: { fgColor: { rgb: EXCEL_COLORS.headerBg }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN }
};

export function rowStyle(rowIdx: number, align: 'left' | 'right' | 'center' = 'left', bold = false) {
    const isAlt = rowIdx % 2 === 1;
    return {
        font: { name: 'Calibri', sz: 10, bold, color: { rgb: EXCEL_COLORS.rowAltText } },
        fill: isAlt ? { fgColor: { rgb: EXCEL_COLORS.rowAltBg }, patternType: 'solid' } : undefined,
        alignment: { horizontal: align, vertical: 'center' },
        border: { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN }
    };
}

export function totalStyle(align: 'left' | 'right' | 'center' = 'right') {
    return {
        font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: EXCEL_COLORS.totalText } },
        fill: { fgColor: { rgb: EXCEL_COLORS.totalBg }, patternType: 'solid' },
        alignment: { horizontal: align, vertical: 'center' },
        border: { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN }
    };
}

export const FORMAT_CURRENCY = '"$"#,##0.00;[Red]-"$"#,##0.00';
export const FORMAT_INT = '#,##0';

/** Coloca una celda en posición [r,c] con valor + estilo. */
export function setCell(ws: any, r: number, c: number, value: any, style?: any, fmt?: string) {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell: any = { v: value };
    if (typeof value === 'number') cell.t = 'n';
    else if (value instanceof Date) cell.t = 'd';
    else cell.t = 's';
    if (style) cell.s = style;
    if (fmt) cell.z = fmt;
    ws[addr] = cell;
}

/** Asegura el rango !ref del worksheet basado en (r,c) ya escritos. */
export function fixRange(ws: any, maxR: number, maxC: number) {
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
}

export interface SheetColumn {
    header: string;
    key: string;
    width?: number;
    align?: 'left' | 'right' | 'center';
    format?: string;
    isCurrency?: boolean;
    isNumber?: boolean;
}

export interface BuildSheetOptions {
    title: string;
    meta?: { label: string; value: string }[];
    columns: SheetColumn[];
    rows: any[];
    totalRow?: { label: string; values: Record<string, any> };
}

/**
 * Construye un worksheet con título, metadata, tabla y opcional fila de total.
 * Devuelve el worksheet listo para ser appended a un workbook.
 */
export function buildFormattedSheet(opts: BuildSheetOptions): any {
    const { title, meta = [], columns, rows, totalRow } = opts;
    const ws: any = {};
    const numCols = columns.length;
    let cursor = 0;

    // Title row (merged across all columns)
    setCell(ws, cursor, 0, title, STYLE_TITLE);
    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s: { r: cursor, c: 0 }, e: { r: cursor, c: numCols - 1 } });
    if (!ws['!rows']) ws['!rows'] = [];
    ws['!rows'][cursor] = { hpt: 28 };
    cursor++;

    // Blank separator
    cursor++;

    // Meta block: pairs label / value
    if (meta.length > 0) {
        for (const m of meta) {
            setCell(ws, cursor, 0, m.label, STYLE_META_LABEL);
            setCell(ws, cursor, 1, m.value, STYLE_META_VALUE);
            // Merge value across remaining columns for readability
            if (numCols > 2) {
                ws['!merges'].push({ s: { r: cursor, c: 1 }, e: { r: cursor, c: numCols - 1 } });
            }
            cursor++;
        }
        cursor++; // separator
    }

    // Header row
    const headerRow = cursor;
    columns.forEach((col, idx) => {
        setCell(ws, headerRow, idx, col.header, STYLE_HEADER);
    });
    ws['!rows'][headerRow] = { hpt: 22 };
    cursor++;

    // Data rows
    rows.forEach((row, rIdx) => {
        columns.forEach((col, cIdx) => {
            const raw = row[col.key];
            const align = col.align || (col.isCurrency || col.isNumber ? 'right' : 'left');
            const value = (col.isCurrency || col.isNumber)
                ? (raw === null || raw === undefined || raw === '' ? 0 : Number(raw))
                : (raw ?? '');
            const fmt = col.isCurrency ? FORMAT_CURRENCY : col.format;
            setCell(ws, cursor, cIdx, value, rowStyle(rIdx, align), fmt);
        });
        cursor++;
    });

    // Total row
    if (totalRow) {
        const totalLabelCol = Math.max(0, numCols - Object.keys(totalRow.values).length - 1);
        // Fill empty cells with total bg
        for (let c = 0; c < totalLabelCol; c++) {
            setCell(ws, cursor, c, '', totalStyle('left'));
        }
        setCell(ws, cursor, totalLabelCol, totalRow.label, totalStyle('right'));
        let col = totalLabelCol + 1;
        for (const [key, val] of Object.entries(totalRow.values)) {
            const colDef = columns.find(c => c.key === key);
            const align = colDef?.align || 'right';
            const fmt = colDef?.isCurrency ? FORMAT_CURRENCY : colDef?.format;
            const num = typeof val === 'number' ? val : Number(val) || 0;
            setCell(ws, cursor, col, num, totalStyle(align), fmt);
            col++;
        }
        cursor++;
    }

    // Column widths
    ws['!cols'] = columns.map(c => ({ wch: c.width || 18 }));

    // Freeze panes (header row stays visible while scrolling)
    ws['!freeze'] = { xSplit: 0, ySplit: headerRow + 1 };

    fixRange(ws, cursor - 1, numCols - 1);
    return ws;
}

/** Genera y descarga un archivo XLSX con uno o varios sheets. */
export function downloadXLSX(filename: string, sheets: { name: string; ws: any }[]) {
    const wb = XLSX.utils.book_new();
    for (const { name, ws } of sheets) {
        XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    }
    XLSX.writeFile(wb, filename);
}

/** Sanitiza un texto para usarlo como nombre de archivo seguro. */
export function safeFileName(s: string): string {
    return (s || 'export').replace(/[^a-z0-9_-]+/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}
