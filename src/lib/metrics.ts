/**
 * Telemetría operativa del agente (MySQL).
 *
 * Registra cada llamada al agente: latencia, tokens, modelo, status.
 * Sirve para detectar regresiones, calcular costos y observabilidad.
 */

import { query } from '@/lib/db';

let tableEnsured = false;

export async function ensureMetricsTable(): Promise<void> {
    if (tableEnsured) return;
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS tblAgentMetrics (
                IdMetric BIGINT AUTO_INCREMENT PRIMARY KEY,
                FechaEvento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                IdUsuario VARCHAR(64) NULL,
                Endpoint VARCHAR(50) NOT NULL,
                Modelo VARCHAR(50) NULL,
                Streaming TINYINT NOT NULL DEFAULT 0,
                TokensInput INT NULL,
                TokensOutput INT NULL,
                LatenciaMs INT NULL,
                Status VARCHAR(20) NOT NULL,
                ErrorMsg VARCHAR(500) NULL,
                Extra TEXT NULL,
                INDEX IX_AgentMetrics_Fecha (FechaEvento),
                INDEX IX_AgentMetrics_Usuario (IdUsuario, FechaEvento)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        tableEnsured = true;
    } catch (e) {
        console.error('No se pudo asegurar tblAgentMetrics:', e);
    }
}

export type MetricStatus = 'ok' | 'error' | 'blocked' | 'rate_limited';

export interface MetricRecord {
    userId?: string;
    endpoint: string;
    model?: string;
    streaming?: boolean;
    tokensInput?: number;
    tokensOutput?: number;
    latencyMs?: number;
    status: MetricStatus;
    errorMsg?: string;
    extra?: Record<string, any>;
}

export async function recordMetric(m: MetricRecord): Promise<void> {
    try {
        await ensureMetricsTable();
        await query(
            `INSERT INTO tblAgentMetrics
                (IdUsuario, Endpoint, Modelo, Streaming, TokensInput, TokensOutput,
                 LatenciaMs, Status, ErrorMsg, Extra)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                m.userId || null,
                m.endpoint.slice(0, 50),
                m.model?.slice(0, 50) || null,
                m.streaming ? 1 : 0,
                m.tokensInput || null,
                m.tokensOutput || null,
                m.latencyMs || null,
                m.status,
                m.errorMsg?.slice(0, 500) || null,
                m.extra ? JSON.stringify(m.extra).slice(0, 5000) : null
            ]
        );
    } catch (e) {
        console.error('recordMetric failed:', e);
    }
}

export interface MetricsSummary {
    period_hours: number;
    total_requests: number;
    total_errors: number;
    total_blocked: number;
    total_rate_limited: number;
    total_tokens_input: number;
    total_tokens_output: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
    by_model: Array<{ model: string; count: number; tokens: number }>;
    by_user: Array<{ user: string; count: number; tokens: number }>;
    recent_errors: Array<{ time: string; user: string; error: string }>;
}

export async function getMetricsSummary(periodHours: number = 24): Promise<MetricsSummary> {
    await ensureMetricsTable();

    const since = new Date(Date.now() - periodHours * 60 * 60 * 1000);

    const totalsRaw = await query(
        `SELECT
            COUNT(*) AS total_requests,
            SUM(CASE WHEN Status = 'error' THEN 1 ELSE 0 END) AS total_errors,
            SUM(CASE WHEN Status = 'blocked' THEN 1 ELSE 0 END) AS total_blocked,
            SUM(CASE WHEN Status = 'rate_limited' THEN 1 ELSE 0 END) AS total_rate_limited,
            SUM(IFNULL(TokensInput, 0)) AS total_tokens_input,
            SUM(IFNULL(TokensOutput, 0)) AS total_tokens_output,
            AVG(LatenciaMs) AS avg_latency_ms
         FROM tblAgentMetrics
         WHERE FechaEvento >= ?`,
        [since]
    );
    const totals = (totalsRaw as any[])[0] || {};

    // P95 manual con ORDER BY + LIMIT/OFFSET en MySQL
    const latRows = await query(
        `SELECT LatenciaMs
         FROM tblAgentMetrics
         WHERE FechaEvento >= ? AND LatenciaMs IS NOT NULL
         ORDER BY LatenciaMs ASC`,
        [since]
    );
    const latencies = (latRows as any[]).map(r => Number(r.LatenciaMs));
    const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] || latencies[latencies.length - 1] : 0;

    const byModelRaw = await query(
        `SELECT Modelo, COUNT(*) AS cnt, SUM(IFNULL(TokensInput, 0) + IFNULL(TokensOutput, 0)) AS tokens
         FROM tblAgentMetrics
         WHERE FechaEvento >= ? AND Modelo IS NOT NULL
         GROUP BY Modelo
         ORDER BY cnt DESC`,
        [since]
    );

    const byUserRaw = await query(
        `SELECT IdUsuario, COUNT(*) AS cnt, SUM(IFNULL(TokensInput, 0) + IFNULL(TokensOutput, 0)) AS tokens
         FROM tblAgentMetrics
         WHERE FechaEvento >= ? AND IdUsuario IS NOT NULL
         GROUP BY IdUsuario
         ORDER BY cnt DESC
         LIMIT 10`,
        [since]
    );

    const errorsRaw = await query(
        `SELECT FechaEvento, IdUsuario, ErrorMsg
         FROM tblAgentMetrics
         WHERE FechaEvento >= ? AND Status = 'error'
         ORDER BY FechaEvento DESC
         LIMIT 10`,
        [since]
    );

    return {
        period_hours: periodHours,
        total_requests: Number(totals.total_requests) || 0,
        total_errors: Number(totals.total_errors) || 0,
        total_blocked: Number(totals.total_blocked) || 0,
        total_rate_limited: Number(totals.total_rate_limited) || 0,
        total_tokens_input: Number(totals.total_tokens_input) || 0,
        total_tokens_output: Number(totals.total_tokens_output) || 0,
        avg_latency_ms: Math.round(Number(totals.avg_latency_ms) || 0),
        p95_latency_ms: Math.round(Number(p95) || 0),
        by_model: (byModelRaw as any[]).map(r => ({
            model: r.Modelo,
            count: Number(r.cnt),
            tokens: Number(r.tokens)
        })),
        by_user: (byUserRaw as any[]).map(r => ({
            user: r.IdUsuario,
            count: Number(r.cnt),
            tokens: Number(r.tokens)
        })),
        recent_errors: (errorsRaw as any[]).map(r => ({
            time: r.FechaEvento?.toISOString?.() || String(r.FechaEvento),
            user: r.IdUsuario || 'unknown',
            error: r.ErrorMsg || ''
        }))
    };
}
