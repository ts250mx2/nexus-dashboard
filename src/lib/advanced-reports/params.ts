/**
 * Sustitución SEGURA de parámetros en el SQL de un reporte.
 *
 * El SQL guardado usa tokens `{{token}}`. Aquí los reemplazamos por fragmentos
 * SQL validados según el tipo del parámetro. El resultado SIEMPRE pasa después
 * por assertReadOnly() en el caller, y los valores se validan/escapan aquí:
 *   - date:      'YYYY-MM-DD' validado (o default / fecha segura)
 *   - number:    número validado
 *   - storeList: lista de enteros (n,n,n); vacío → todas las sucursales (subquery)
 *   - text:      '%texto%' con comillas escapadas; vacío → '%' (todo)
 */

import type { ReportParam } from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayISO(): string {
    // Fecha de HOY en México (no UTC): cerca de medianoche evita saltar de día.
    // 'en-CA' formatea como YYYY-MM-DD (compatible con DATE_RE).
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

function escapeLiteral(s: string): string {
    // MySQL: escapamos comilla simple y backslash (modo por defecto, sin NO_BACKSLASH_ESCAPES).
    return s.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

function fragmentFor(p: ReportParam, rawValue: string | undefined): string {
    const raw = (rawValue ?? p.defaultValue ?? '').toString().trim();
    switch (p.kind) {
        case 'date': {
            if (DATE_RE.test(raw)) return `'${raw}'`;
            const def = (p.defaultValue || '').toString().trim();
            if (DATE_RE.test(def)) return `'${def}'`;
            return `'${todayISO()}'`;
        }
        case 'number': {
            const n = Number(raw);
            return Number.isFinite(n) ? String(n) : '0';
        }
        case 'storeList': {
            const ids = raw
                .split(',')
                .map((s) => Number(s.trim()))
                .filter((n) => Number.isFinite(n) && n > 0);
            return ids.length > 0
                ? `(${ids.join(',')})`
                : `(SELECT IdSucursal FROM tblSucursales)`;
        }
        case 'text': {
            const t = escapeLiteral(raw);
            return t ? `'%${t}%'` : `'%'`;
        }
        default:
            return `''`;
    }
}

/** Reemplaza todos los `{{token}}` del SQL por fragmentos seguros. */
export function substituteParams(
    sql: string,
    params: ReportParam[] | undefined,
    values: Record<string, string> = {}
): string {
    if (!params || params.length === 0) return sql;
    let out = sql;
    for (const p of params) {
        if (!p || !p.token) continue;
        const frag = fragmentFor(p, values[p.token]);
        out = out.split(`{{${p.token}}}`).join(frag);
    }
    return out;
}

/**
 * Sustituye el token `{{clicked}}` del SQL de drill-down por el valor clickeado,
 * como literal SQL seguro (comillas escapadas, longitud acotada). El valor llega
 * del cliente, por eso se escapa SIEMPRE; el resultado pasa luego por assertReadOnly.
 */
export function substituteClicked(sql: string, clicked: string): string {
    const safe = escapeLiteral(String(clicked ?? '').slice(0, 200));
    return sql.split('{{clicked}}').join(`'${safe}'`);
}
