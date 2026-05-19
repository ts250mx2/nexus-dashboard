/**
 * SQL Sandbox - Read-Only Validator (MySQL flavor)
 *
 * Bloquea cualquier intento de modificar la base. Solo permite
 * SELECT / WITH (CTE). Es la primera línea de defensa; idealmente
 * el usuario de DB también debe tener únicamente permisos SELECT.
 */

const FORBIDDEN_KEYWORDS = [
    'INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'MERGE', 'TRUNCATE',
    'CREATE', 'ALTER', 'DROP', 'RENAME',
    'GRANT', 'REVOKE',
    'CALL', 'HANDLER', 'LOAD', 'LOCK', 'UNLOCK',
    'SET', 'START', 'COMMIT', 'ROLLBACK',
    'SHUTDOWN', 'KILL', 'PREPARE', 'EXECUTE', 'DEALLOCATE',
    'OUTFILE', 'DUMPFILE', 'INFILE'
];

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
    { pattern: /\bINTO\s+OUTFILE\b/i, reason: 'INTO OUTFILE no permitido' },
    { pattern: /\bINTO\s+DUMPFILE\b/i, reason: 'INTO DUMPFILE no permitido' },
    { pattern: /;\s*\S/i, reason: 'Múltiples statements en una consulta no permitidos' }
];

export interface SqlValidationResult {
    valid: boolean;
    reason?: string;
    sanitized?: string;
}

export function validateReadOnlySql(sql: string): SqlValidationResult {
    if (!sql || typeof sql !== 'string') {
        return { valid: false, reason: 'SQL vacío o inválido' };
    }

    const trimmed = sql.trim();
    if (trimmed.length === 0) {
        return { valid: false, reason: 'SQL vacío' };
    }

    const startsWithReadOp = /^(\s*WITH\b|\s*SELECT\b|\s*\(\s*SELECT\b)/i.test(trimmed);
    if (!startsWithReadOp) {
        return {
            valid: false,
            reason: 'Solo se permiten consultas de lectura (SELECT o WITH)'
        };
    }

    const stripped = trimmed
        .replace(/'(?:[^']|'')*'/g, "''")
        .replace(/"(?:[^"]|"")*"/g, '""')
        .replace(/`[^`]*`/g, '``')
        .replace(/--[^\n]*/g, '')
        .replace(/#[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');

    const upper = stripped.toUpperCase();
    for (const kw of FORBIDDEN_KEYWORDS) {
        const re = new RegExp(`\\b${kw}\\b`, 'i');
        if (re.test(upper)) {
            return {
                valid: false,
                reason: `Operación prohibida: ${kw}. Este agente solo puede consultar datos, no modificarlos.`
            };
        }
    }

    for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
        if (pattern.test(stripped)) {
            return { valid: false, reason };
        }
    }

    const sanitized = trimmed.replace(/;\s*$/, '');
    return { valid: true, sanitized };
}

export function assertReadOnly(sql: string): string {
    const result = validateReadOnlySql(sql);
    if (!result.valid) {
        throw new Error(`SQL bloqueado por sandbox: ${result.reason}`);
    }
    return result.sanitized!;
}
