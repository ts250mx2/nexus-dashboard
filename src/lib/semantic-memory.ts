/**
 * Memoria semántica del agente (MySQL flavor).
 *
 * Guarda preguntas + respuestas + SQL con embeddings vectoriales.
 * Permite buscar "preguntas similares anteriores" antes de re-ejecutar.
 *
 * Backend: OpenAI text-embedding-3-small (1536 dims).
 * Storage: MySQL, embedding como JSON en columna LONGTEXT.
 *   - Cosine similarity en memoria cargando los embeddings recientes del usuario.
 */

import { query } from '@/lib/db';
import { openai } from '@/lib/ai';

let tableEnsured = false;

export async function ensureMemoryTable(): Promise<void> {
    if (tableEnsured) return;
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS tblAgentMemoria (
                IdMemoria VARCHAR(64) NOT NULL PRIMARY KEY,
                IdUsuario VARCHAR(64) NULL,
                Pregunta VARCHAR(2000) NOT NULL,
                Respuesta LONGTEXT NULL,
                ConsultaSQL LONGTEXT NULL,
                EmbeddingJson LONGTEXT NOT NULL,
                AiModel VARCHAR(64) NULL,
                FechaCreacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX IX_AgentMemoria_Usuario (IdUsuario, FechaCreacion)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        tableEnsured = true;
    } catch (e) {
        console.error('No se pudo asegurar tblAgentMemoria:', e);
    }
}

export async function embedText(text: string): Promise<number[]> {
    const trimmed = (text || '').slice(0, 8000);
    if (!trimmed) throw new Error('Texto vacío');
    const res = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: trimmed
    });
    return res.data[0].embedding;
}

function cosineSim(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export async function saveMemory(opts: {
    userId?: string | null;
    prompt: string;
    response: string;
    sql?: string | null;
    aiModel?: string | null;
}): Promise<void> {
    await ensureMemoryTable();
    try {
        const embedding = await embedText(opts.prompt);
        const id = 'mem_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
        await query(
            `INSERT INTO tblAgentMemoria
             (IdMemoria, IdUsuario, Pregunta, Respuesta, ConsultaSQL, EmbeddingJson, AiModel)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                opts.userId || null,
                opts.prompt.slice(0, 2000),
                opts.response.slice(0, 10000),
                opts.sql?.slice(0, 10000) || null,
                JSON.stringify(embedding),
                opts.aiModel || null
            ]
        );
    } catch (e) {
        console.error('saveMemory failed:', e);
    }
}

export interface MemorySearchHit {
    id: string;
    prompt: string;
    response: string;
    sql: string | null;
    createdAt: string;
    similarity: number;
}

export async function searchSimilar(opts: {
    userId?: string | null;
    prompt: string;
    threshold?: number;
    topN?: number;
}): Promise<MemorySearchHit[]> {
    const threshold = opts.threshold ?? 0.82;
    const topN = opts.topN ?? 3;

    if (!opts.prompt || opts.prompt.length < 6) return [];

    await ensureMemoryTable();

    try {
        const queryEmbedding = await embedText(opts.prompt);

        const userClause = opts.userId ? `WHERE IdUsuario = ?` : '';
        const params = opts.userId ? [opts.userId] : [];
        const rows = await query(`
            SELECT IdMemoria, Pregunta, Respuesta, ConsultaSQL, EmbeddingJson, FechaCreacion
            FROM tblAgentMemoria
            ${userClause}
            ORDER BY FechaCreacion DESC
            LIMIT 500
        `, params) as any[];

        const hits: MemorySearchHit[] = [];
        for (const r of rows) {
            try {
                const emb = JSON.parse(r.EmbeddingJson) as number[];
                const sim = cosineSim(queryEmbedding, emb);
                if (sim >= threshold) {
                    hits.push({
                        id: r.IdMemoria,
                        prompt: r.Pregunta,
                        response: r.Respuesta,
                        sql: r.ConsultaSQL,
                        createdAt: r.FechaCreacion instanceof Date ? r.FechaCreacion.toISOString() : String(r.FechaCreacion),
                        similarity: sim
                    });
                }
            } catch {
                // ignore corrupt embedding
            }
        }

        hits.sort((a, b) => b.similarity - a.similarity);
        return hits.slice(0, topN);
    } catch (e) {
        console.error('searchSimilar failed:', e);
        return [];
    }
}
