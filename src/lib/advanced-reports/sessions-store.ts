/**
 * Persistencia de las conversaciones del Agente Avanzado (pestañas), por usuario.
 * Permite abrir las mismas conversaciones desde otra computadora (clave: IdUsuario).
 */

import { query } from '@/lib/db';

let ensured = false;

export async function ensureSessionsTable(): Promise<void> {
    if (ensured) return;
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS tblAgentConsoleSessions (
                IdSesion VARCHAR(64) NOT NULL PRIMARY KEY,
                IdUsuario VARCHAR(64) NOT NULL,
                Titulo VARCHAR(120) NOT NULL,
                LinesJson LONGTEXT NULL,
                HistoryJson LONGTEXT NULL,
                EditingReportId INT NULL,
                FechaActualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                Eliminado TINYINT NOT NULL DEFAULT 0,
                INDEX IX_ConsoleSessions_Usuario (IdUsuario, Eliminado, FechaActualizacion)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        ensured = true;
    } catch (e) {
        console.error('No se pudo asegurar tblAgentConsoleSessions:', e);
    }
}

function parseJsonSafe<T>(s: string | null | undefined, fallback: T): T {
    if (!s) return fallback;
    try { return JSON.parse(s) as T; } catch { return fallback; }
}

export interface ConsoleSession {
    id: string;
    title: string;
    lines: any[];
    history: any[];
    editingReportId?: number | null;
}

export async function listSessions(userId: string): Promise<ConsoleSession[]> {
    await ensureSessionsTable();
    const rows = (await query(
        `SELECT IdSesion, Titulo, LinesJson, HistoryJson, EditingReportId
         FROM tblAgentConsoleSessions
         WHERE IdUsuario = ? AND Eliminado = 0
         ORDER BY FechaActualizacion ASC`,
        [userId]
    )) as any[];
    return rows.map((r) => ({
        id: r.IdSesion,
        title: r.Titulo,
        lines: parseJsonSafe<any[]>(r.LinesJson, []),
        history: parseJsonSafe<any[]>(r.HistoryJson, []),
        editingReportId: r.EditingReportId != null ? Number(r.EditingReportId) : null,
    }));
}

export async function upsertSession(userId: string, s: ConsoleSession): Promise<void> {
    await ensureSessionsTable();
    const linesJson = JSON.stringify(s.lines || []).slice(0, 400000);
    const histJson = JSON.stringify(s.history || []).slice(0, 200000);
    const title = (s.title || 'Agente').slice(0, 120);
    const editId = s.editingReportId ?? null;
    await query(
        `INSERT INTO tblAgentConsoleSessions
            (IdSesion, IdUsuario, Titulo, LinesJson, HistoryJson, EditingReportId, Eliminado)
         VALUES (?, ?, ?, ?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE
            Titulo = VALUES(Titulo),
            LinesJson = VALUES(LinesJson),
            HistoryJson = VALUES(HistoryJson),
            EditingReportId = VALUES(EditingReportId),
            Eliminado = 0,
            FechaActualizacion = CURRENT_TIMESTAMP`,
        [s.id, userId, title, linesJson, histJson, editId]
    );
}

export async function deleteSession(userId: string, id: string): Promise<void> {
    await ensureSessionsTable();
    await query(
        `UPDATE tblAgentConsoleSessions SET Eliminado = 1 WHERE IdSesion = ? AND IdUsuario = ?`,
        [id, userId]
    );
}
