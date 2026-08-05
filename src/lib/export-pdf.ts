/**
 * Exportación a PDF de un reporte del Agente Avanzado (cliente).
 *
 * Usa jsPDF + autoTable (ya presentes en el proyecto para los demás reportes).
 * Soporta una sola tabla (reporte simple) o varias (tablero multi-bloque).
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface PdfTable {
    title?: string;
    rows: Record<string, any>[];
}

export interface DownloadPdfOptions {
    question: string;                  // título del documento
    analysis?: string;                 // descripción / lectura principal
    keyInsights?: string[];
    recommendations?: string[];
    data?: Record<string, any>[];      // reporte simple: una sola tabla
    tables?: PdfTable[];               // tablero: una tabla por bloque
    aiModel?: string;
}

const MAX_ROWS_PER_TABLE = 200;
const MAX_COLS = 8;

function stripBold(s: string): string {
    return String(s ?? '').replace(/\*\*/g, '');
}

function formatValue(value: any): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toLocaleDateString('es-MX');
    if (typeof value === 'number') return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(value);
    return String(value);
}

function addTable(doc: jsPDF, rows: Record<string, any>[], startY: number, title?: string): number {
    if (!rows || rows.length === 0) return startY;
    const cols = Object.keys(rows[0]).slice(0, MAX_COLS);

    if (title) {
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text(stripBold(title), 14, startY);
        startY += 5;
    }

    autoTable(doc, {
        head: [cols],
        body: rows.slice(0, MAX_ROWS_PER_TABLE).map((r) => cols.map((c) => formatValue(r[c]))),
        startY,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 8, cellPadding: 2 },
    });

    return (doc as any).lastAutoTable.finalY + 8;
}

function addBullets(doc: jsPDF, items: string[], startY: number, title: string, color: [number, number, number]): number {
    if (!items || items.length === 0) return startY;
    let y = startY;
    if (y > 250) { doc.addPage(); y = 20; }

    doc.setFontSize(11);
    doc.setTextColor(...color);
    doc.text(title, 14, y);
    y += 6;

    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    for (const item of items) {
        const lines = doc.splitTextToSize(`• ${stripBold(item)}`, 180);
        if (y + lines.length * 4.5 > 285) { doc.addPage(); y = 20; }
        doc.text(lines, 14, y);
        y += lines.length * 4.5 + 2;
    }
    return y + 4;
}

export function downloadPdf(opts: DownloadPdfOptions): void {
    const doc = new jsPDF();

    doc.setFontSize(17);
    doc.setTextColor(30, 41, 59);
    doc.text(doc.splitTextToSize(stripBold(opts.question), 180), 14, 20);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(
        `Generado el ${new Date().toLocaleString('es-MX')}${opts.aiModel ? ` · Modelo: ${opts.aiModel}` : ''}`,
        14,
        28
    );

    let y = 36;

    if (opts.analysis) {
        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85);
        const lines = doc.splitTextToSize(stripBold(opts.analysis), 180);
        doc.text(lines, 14, y);
        y += lines.length * 5 + 4;
    }

    if (opts.tables && opts.tables.length > 0) {
        for (const t of opts.tables) {
            if (y > 240) { doc.addPage(); y = 20; }
            y = addTable(doc, t.rows, y, t.title);
        }
    } else if (opts.data && opts.data.length > 0) {
        y = addTable(doc, opts.data, y);
    }

    y = addBullets(doc, opts.keyInsights || [], y, 'Hallazgos', [79, 70, 229]);
    addBullets(doc, opts.recommendations || [], y, 'Acciones recomendadas', [5, 150, 105]);

    const filename = stripBold(opts.question).slice(0, 40).replace(/[^a-z0-9]+/gi, '_') || 'reporte';
    doc.save(`${filename}.pdf`);
}
