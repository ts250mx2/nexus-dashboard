/**
 * Prompts proactivos del agente — el agente inicia la conversación (MySQL flavor).
 *
 * Diferencia con alertas:
 *  - Alertas: notificación pasiva ("se disparó la regla X")
 *  - Prompts proactivos: pregunta conversacional ("Detecté Y, ¿lo investigamos?")
 *
 * Limite por defecto: 3 prompts por usuario por día.
 */

import { query } from '@/lib/db';
import { anthropic } from '@/lib/anthropic';

let tableEnsured = false;

export async function ensureProactiveTable(): Promise<void> {
    if (tableEnsured) return;
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS tblAgentProactivePrompts (
                IdPrompt VARCHAR(64) NOT NULL PRIMARY KEY,
                IdUsuario VARCHAR(64) NOT NULL,
                Mensaje VARCHAR(500) NOT NULL,
                Contexto VARCHAR(500) NULL,
                AccionSugerida VARCHAR(300) NOT NULL,
                Severidad VARCHAR(20) NOT NULL DEFAULT 'info',
                FechaCreacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                Status VARCHAR(20) NOT NULL DEFAULT 'pending',
                FechaResuelto DATETIME NULL,
                INDEX IX_AgentProactive_Usuario (IdUsuario, Status, FechaCreacion)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        tableEnsured = true;
    } catch (e) {
        console.error('No se pudo asegurar tblAgentProactivePrompts:', e);
    }
}

export type ProactiveSeverity = 'critical' | 'opportunity' | 'info';
export type ProactiveStatus = 'pending' | 'accepted' | 'dismissed';

export interface ProactivePrompt {
    id: string;
    userId: string;
    message: string;
    context: string | null;
    suggestedAction: string;
    severity: ProactiveSeverity;
    createdAt: string;
    status: ProactiveStatus;
    resolvedAt: string | null;
}

function mapRow(r: any): ProactivePrompt {
    return {
        id: r.IdPrompt,
        userId: r.IdUsuario,
        message: r.Mensaje,
        context: r.Contexto,
        suggestedAction: r.AccionSugerida,
        severity: r.Severidad as ProactiveSeverity,
        createdAt: r.FechaCreacion?.toISOString?.() || String(r.FechaCreacion),
        status: r.Status as ProactiveStatus,
        resolvedAt: r.FechaResuelto
            ? (r.FechaResuelto?.toISOString?.() || String(r.FechaResuelto))
            : null
    };
}

export async function listPendingPrompts(userId: string, limit = 5): Promise<ProactivePrompt[]> {
    await ensureProactiveTable();
    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
    const rows = await query(
        `SELECT * FROM tblAgentProactivePrompts
         WHERE IdUsuario = ? AND Status = 'pending'
         ORDER BY FechaCreacion DESC
         LIMIT ${safeLimit}`,
        [userId]
    );
    return (rows as any[]).map(mapRow);
}

export async function resolvePrompt(userId: string, id: string, status: 'accepted' | 'dismissed'): Promise<void> {
    await ensureProactiveTable();
    await query(
        `UPDATE tblAgentProactivePrompts
         SET Status = ?, FechaResuelto = CURRENT_TIMESTAMP
         WHERE IdPrompt = ? AND IdUsuario = ? AND Status = 'pending'`,
        [status, id, userId]
    );
}

export async function insertPrompt(opts: Omit<ProactivePrompt, 'createdAt' | 'status' | 'resolvedAt'>): Promise<void> {
    await ensureProactiveTable();
    await query(
        `INSERT INTO tblAgentProactivePrompts (IdPrompt, IdUsuario, Mensaje, Contexto, AccionSugerida, Severidad)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [opts.id, opts.userId, opts.message.slice(0, 500),
         opts.context?.slice(0, 500) || null, opts.suggestedAction.slice(0, 300), opts.severity]
    );
}

export function generatePromptId(): string {
    return 'pp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

export async function countTodayPrompts(userId: string): Promise<number> {
    await ensureProactiveTable();
    const rows = await query(
        `SELECT COUNT(*) AS c FROM tblAgentProactivePrompts
         WHERE IdUsuario = ?
           AND FechaCreacion >= CURDATE()`,
        [userId]
    );
    return Number((rows as any[])[0]?.c) || 0;
}

export async function generateProactivePromptsFromInsights(opts: {
    userId: string;
    insights: Array<{
        question: string;
        severity: 'critical' | 'opportunity' | 'info';
        area: string;
        summary: string;
    }>;
    maxPerDay?: number;
}): Promise<ProactivePrompt[]> {
    const { userId, insights, maxPerDay = 3 } = opts;

    if (insights.length === 0) return [];

    const todayCount = await countTodayPrompts(userId);
    const slotsLeft = maxPerDay - todayCount;
    if (slotsLeft <= 0) return [];

    const sevWeight: Record<string, number> = { critical: 3, opportunity: 2, info: 1 };
    const sorted = [...insights].sort((a, b) =>
        (sevWeight[b.severity] || 0) - (sevWeight[a.severity] || 0)
    );

    const candidates = sorted.slice(0, slotsLeft);

    const reformulationPrompt = `Eres Nexus IA, consultor senior. Vas a reformular ${candidates.length} hallazgos
detectados en el negocio como conversaciones cortas que el agente le inicia al usuario.

Cada prompt debe:
- Empezar con "Detecté…" o "Vi que…" o similar (tono casual de colega senior)
- Mencionar el dato concreto que llamó la atención
- Terminar con una invitación específica a investigar/decidir
- Máximo 2 oraciones, conversacional

EJEMPLO:
Input: { question: "¿Por qué Centro cayó 25%?", summary: "Centro tuvo $92K, -25% vs ayer", severity: "critical" }
Output: {
  "message": "Detecté que Centro cerró ayer en $92K, 25% bajo el promedio reciente y no parece estacional.",
  "context": "Caída concentrada en últimas 2 horas, vale revisar si hubo incidente operativo.",
  "suggestedAction": "¿Por qué Centro cayó 25% ayer?"
}

INPUT (${candidates.length} hallazgos):
${candidates.map((c, i) => `[${i}] severity=${c.severity} area=${c.area}
  question: ${c.question}
  summary: ${c.summary}`).join('\n\n')}

RESPONDE EN JSON ESTRICTO (sin markdown):
{
  "prompts": [
    {
      "message": "Texto conversacional 1-2 oraciones",
      "context": "Detalle adicional opcional, 1 oración",
      "suggestedAction": "Pregunta concreta para arrancar la conversación"
    }
  ]
}

Genera EXACTAMENTE ${candidates.length} prompts en el mismo orden del input. Devuelve SOLO el JSON.`;

    let reformulated: any[] = [];
    try {
        const resp = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2000,
            messages: [{ role: 'user', content: reformulationPrompt }]
        });
        const text = (resp.content[0] as any)?.text || '';
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start >= 0 && end > start) {
            const parsed = JSON.parse(text.substring(start, end + 1));
            if (Array.isArray(parsed.prompts)) reformulated = parsed.prompts;
        }
    } catch (e) {
        console.error('Reformulation failed:', e);
    }

    const generated: ProactivePrompt[] = [];
    for (let i = 0; i < candidates.length; i++) {
        const ins = candidates[i];
        const ref = reformulated[i] || {};
        const id = generatePromptId();
        const prompt: ProactivePrompt = {
            id,
            userId,
            message: String(ref.message || `Detecté algo en ${ins.area}: ${ins.summary}`).slice(0, 500),
            context: ref.context ? String(ref.context).slice(0, 500) : null,
            suggestedAction: String(ref.suggestedAction || ins.question).slice(0, 300),
            severity: ins.severity,
            createdAt: new Date().toISOString(),
            status: 'pending',
            resolvedAt: null
        };
        try {
            await insertPrompt({
                id: prompt.id,
                userId: prompt.userId,
                message: prompt.message,
                context: prompt.context,
                suggestedAction: prompt.suggestedAction,
                severity: prompt.severity
            });
            generated.push(prompt);
        } catch (e) {
            console.error('insertPrompt failed:', e);
        }
    }

    return generated;
}
