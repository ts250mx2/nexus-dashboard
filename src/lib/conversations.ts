/**
 * Persistencia de conversaciones del agente (MySQL).
 *
 * Tabla: tblAgentConversaciones
 *  - Una fila por conversación
 *  - Mensajes serializados a JSON en una sola columna
 *  - Soft delete con flag Eliminada
 *  - Auto-creación lazy al primer uso
 */

import { query } from '@/lib/db';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

const SECRET_KEY = new TextEncoder().encode(
    process.env.JWT_SECRET || 'your-secret-key-here'
);

let tableEnsured = false;

export async function ensureConversationsTable(): Promise<void> {
    if (tableEnsured) return;
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS tblAgentConversaciones (
                IdConversacion VARCHAR(64) NOT NULL PRIMARY KEY,
                IdUsuario VARCHAR(64) NOT NULL,
                Titulo VARCHAR(300) NULL,
                MensajesJson LONGTEXT NULL,
                FechaCreacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FechaActualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                Eliminada TINYINT NOT NULL DEFAULT 0,
                INDEX IX_AgentConv_Usuario (IdUsuario, Eliminada, FechaActualizacion DESC)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        tableEnsured = true;
    } catch (e) {
        console.error('No se pudo asegurar tblAgentConversaciones:', e);
        throw e;
    }
}

export async function getUserId(): Promise<string> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('session');
        if (!token) return 'anonymous';
        const { payload } = await jwtVerify(token.value, SECRET_KEY);
        return String((payload as any).id || (payload as any).user || 'anonymous');
    } catch {
        return 'anonymous';
    }
}

export interface ConversationSummary {
    id: string;
    title: string;
    updated_at: string;
    created_at: string;
}

export interface ConversationFull extends ConversationSummary {
    messages: any[];
}

export async function listConversations(userId: string, limit = 50): Promise<ConversationSummary[]> {
    await ensureConversationsTable();
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const rows = await query(
        `SELECT IdConversacion, Titulo, FechaCreacion, FechaActualizacion
         FROM tblAgentConversaciones
         WHERE IdUsuario = ? AND Eliminada = 0
         ORDER BY FechaActualizacion DESC
         LIMIT ${safeLimit}`,
        [userId]
    );
    return (rows as any[]).map(r => ({
        id: r.IdConversacion,
        title: r.Titulo || 'Conversación sin título',
        created_at: r.FechaCreacion?.toISOString?.() || String(r.FechaCreacion),
        updated_at: r.FechaActualizacion?.toISOString?.() || String(r.FechaActualizacion)
    }));
}

export async function getConversation(userId: string, id: string): Promise<ConversationFull | null> {
    await ensureConversationsTable();
    const rows = await query(
        `SELECT IdConversacion, Titulo, MensajesJson, FechaCreacion, FechaActualizacion
         FROM tblAgentConversaciones
         WHERE IdConversacion = ? AND IdUsuario = ? AND Eliminada = 0
         LIMIT 1`,
        [id, userId]
    );
    const r = (rows as any[])[0];
    if (!r) return null;

    let messages: any[] = [];
    try {
        messages = r.MensajesJson ? JSON.parse(r.MensajesJson) : [];
    } catch {
        messages = [];
    }

    return {
        id: r.IdConversacion,
        title: r.Titulo || 'Conversación sin título',
        messages,
        created_at: r.FechaCreacion?.toISOString?.() || String(r.FechaCreacion),
        updated_at: r.FechaActualizacion?.toISOString?.() || String(r.FechaActualizacion)
    };
}

export async function saveConversation(opts: {
    userId: string;
    id: string;
    title: string;
    messages: any[];
}): Promise<void> {
    await ensureConversationsTable();
    const { userId, id, title, messages } = opts;
    const messagesJson = JSON.stringify(messages).slice(0, 10_000_000);

    await query(
        `INSERT INTO tblAgentConversaciones
            (IdConversacion, IdUsuario, Titulo, MensajesJson)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            Titulo = VALUES(Titulo),
            MensajesJson = VALUES(MensajesJson),
            FechaActualizacion = CURRENT_TIMESTAMP`,
        [id, userId, title, messagesJson]
    );
}

export async function deleteConversation(userId: string, id: string): Promise<void> {
    await ensureConversationsTable();
    await query(
        `UPDATE tblAgentConversaciones
         SET Eliminada = 1, FechaActualizacion = CURRENT_TIMESTAMP
         WHERE IdConversacion = ? AND IdUsuario = ?`,
        [id, userId]
    );
}

export function generateTitle(firstUserMessage: string): string {
    const cleaned = firstUserMessage
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
    return cleaned || 'Conversación nueva';
}
