/**
 * Feedback loop del agente — 👍/👎 + razón opcional (MySQL flavor).
 *
 * Se guarda junto con el prompt original, la respuesta y el SQL para que
 * sirva como insumo cuando iteres el prompt o detectes patrones que fallan.
 */

import { query } from '@/lib/db';

let tableEnsured = false;

export async function ensureFeedbackTable(): Promise<void> {
    if (tableEnsured) return;
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS tblAgentFeedback (
                IdFeedback VARCHAR(64) NOT NULL PRIMARY KEY,
                IdConversacion VARCHAR(64) NULL,
                IdMensaje VARCHAR(64) NOT NULL,
                IdUsuario VARCHAR(64) NULL,
                Rating VARCHAR(8) NOT NULL,
                Razon VARCHAR(1000) NULL,
                Pregunta LONGTEXT NULL,
                Respuesta LONGTEXT NULL,
                ConsultaSQL LONGTEXT NULL,
                AiModel VARCHAR(64) NULL,
                FechaCreacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX IX_AgentFeedback_Rating (Rating, FechaCreacion),
                INDEX IX_AgentFeedback_Mensaje (IdMensaje)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        tableEnsured = true;
    } catch (e) {
        console.error('No se pudo asegurar tblAgentFeedback:', e);
    }
}

export interface FeedbackInput {
    messageId: string;
    conversationId?: string | null;
    userId?: string | null;
    rating: 'up' | 'down';
    reason?: string | null;
    prompt?: string | null;
    response?: string | null;
    sql?: string | null;
    aiModel?: string | null;
}

export async function recordFeedback(input: FeedbackInput): Promise<void> {
    await ensureFeedbackTable();
    const id = 'fb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    await query(
        `INSERT INTO tblAgentFeedback
         (IdFeedback, IdConversacion, IdMensaje, IdUsuario, Rating, Razon, Pregunta, Respuesta, ConsultaSQL, AiModel)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id,
            input.conversationId || null,
            input.messageId,
            input.userId || null,
            input.rating,
            input.reason?.slice(0, 1000) || null,
            input.prompt?.slice(0, 8000) || null,
            input.response?.slice(0, 8000) || null,
            input.sql?.slice(0, 8000) || null,
            input.aiModel || null
        ]
    );
}

export interface FeedbackStats {
    totals: { up: number; down: number; total: number };
    ratingPct: number;
    last7Days: { date: string; up: number; down: number }[];
    recentDown: Array<{
        id: string;
        createdAt: string;
        reason: string | null;
        prompt: string | null;
        response: string | null;
        sql: string | null;
        aiModel: string | null;
    }>;
}

export async function getFeedbackStats(daysBack = 30): Promise<FeedbackStats> {
    await ensureFeedbackTable();
    const safeDays = Math.max(1, Math.min(365, Math.floor(daysBack)));

    const totalsRows = await query(`
        SELECT Rating, COUNT(*) AS Cnt
        FROM tblAgentFeedback
        WHERE FechaCreacion >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)
        GROUP BY Rating
    `) as any[];

    let up = 0;
    let down = 0;
    for (const r of totalsRows) {
        if (r.Rating === 'up') up = Number(r.Cnt) || 0;
        if (r.Rating === 'down') down = Number(r.Cnt) || 0;
    }
    const total = up + down;
    const ratingPct = total > 0 ? (up / total) * 100 : 0;

    const trendRows = await query(`
        SELECT DATE(FechaCreacion) AS Fecha,
               SUM(CASE WHEN Rating = 'up' THEN 1 ELSE 0 END) AS Up_,
               SUM(CASE WHEN Rating = 'down' THEN 1 ELSE 0 END) AS Down_
        FROM tblAgentFeedback
        WHERE FechaCreacion >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(FechaCreacion)
        ORDER BY Fecha
    `) as any[];

    const last7Days = trendRows.map(r => ({
        date: r.Fecha instanceof Date ? r.Fecha.toISOString().slice(0, 10) : String(r.Fecha).slice(0, 10),
        up: Number(r.Up_) || 0,
        down: Number(r.Down_) || 0
    }));

    const downRows = await query(`
        SELECT IdFeedback, FechaCreacion, Razon, Pregunta, Respuesta, ConsultaSQL, AiModel
        FROM tblAgentFeedback
        WHERE Rating = 'down'
        ORDER BY FechaCreacion DESC
        LIMIT 25
    `) as any[];

    const recentDown = downRows.map(r => ({
        id: r.IdFeedback,
        createdAt: r.FechaCreacion instanceof Date ? r.FechaCreacion.toISOString() : String(r.FechaCreacion),
        reason: r.Razon,
        prompt: r.Pregunta,
        response: r.Respuesta,
        sql: r.ConsultaSQL,
        aiModel: r.AiModel
    }));

    return {
        totals: { up, down, total },
        ratingPct,
        last7Days,
        recentDown
    };
}
