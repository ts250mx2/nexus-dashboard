/** Formateadores compartidos por los tableros. Todos toleran null y NaN. */

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const currencyShort = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
});
const integer = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });

export function formatCurrency(value: unknown): string {
    const n = Number(value);
    return currency.format(Number.isFinite(n) ? n : 0);
}

/** Moneda sin centavos, para KPIs y ejes de gráfica. */
export function formatCurrencyShort(value: unknown): string {
    const n = Number(value);
    return currencyShort.format(Number.isFinite(n) ? n : 0);
}

export function formatInt(value: unknown): string {
    const n = Number(value);
    return integer.format(Number.isFinite(n) ? Math.round(n) : 0);
}

export function formatDecimal(value: unknown, digits = 2): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('es-MX', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Días de cobertura. `null` significa que el artículo no tiene salida en el periodo. */
export function formatCobertura(value: unknown): string {
    if (value === null || value === undefined) return 'Sin salida';
    const n = Number(value);
    if (!Number.isFinite(n)) return 'Sin salida';
    if (n >= 999) return '+999 d';
    return `${formatDecimal(n, 0)} d`;
}

export function formatDate(value: unknown): string {
    if (!value) return '—';
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatTime(date = new Date()): string {
    return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
