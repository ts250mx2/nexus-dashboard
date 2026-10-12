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

/**
 * Una fecha de calendario ('YYYY-MM-DD') se interpreta en hora LOCAL. `new Date`
 * la tomaría como medianoche UTC y en UTC-6 caería en el día anterior.
 */
function parseFecha(value: unknown): Date {
    const texto = String(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T00:00:00`) : new Date(texto);
}

export function formatDate(value: unknown): string {
    if (!value) return '—';
    const d = parseFecha(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Fecha y hora, para marcas de última actualización. */
export function formatDateTime(value: unknown): string {
    if (!value) return '—';
    const d = parseFecha(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

/** Solo la hora de una fecha ("06:53 p.m."), sin segundos: para tablas apretadas. */
export function formatHora(value: unknown): string {
    if (!value) return '';
    const d = parseFecha(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Días completos de calendario entre una fecha y hoy. Se comparan días, no
 * bloques de 24 horas: una venta de anoche debe decir "Ayer", no "Hoy".
 * Devuelve null cuando no hay fecha.
 */
export function diasDesde(value: unknown, hoy = new Date()): number | null {
    if (!value) return null;
    const fecha = new Date(String(value));
    if (Number.isNaN(fecha.getTime())) return null;
    const soloDia = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((soloDia(hoy) - soloDia(fecha)) / 86_400_000);
}

/** "Hoy", "Ayer" o "Hace N días", para leer de un vistazo qué tan vieja es una fecha. */
export function formatAntiguedad(value: unknown, hoy = new Date()): string {
    const dias = diasDesde(value, hoy);
    if (dias === null) return '—';
    if (dias <= 0) return 'Hoy';
    if (dias === 1) return 'Ayer';
    return `Hace ${formatInt(dias)} días`;
}

export function formatTime(date = new Date()): string {
    return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
