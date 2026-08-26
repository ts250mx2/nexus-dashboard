/** mysql2 entrega DATETIME como Date; se normaliza a ISO 8601 para el JSON. */
export function toIso(value: unknown): string | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
