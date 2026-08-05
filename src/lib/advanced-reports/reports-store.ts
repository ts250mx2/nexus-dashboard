/**
 * Persistencia del Agente Avanzado (MySQL).
 *
 * - tblAgentReports:        una fila = un reporte guardado (definición JSON data-driven).
 * - tblAgentReportFolders:  carpetas para organizar la galería.
 * - tblAgentReportRuns:     log de cada ejecución (tokens/costo real conciliado).
 *
 * Sigue el idiom del codebase (metrics.ts / conversations.ts): auto-creación lazy
 * con `CREATE TABLE IF NOT EXISTS` y soft-delete con `Eliminado TINYINT`.
 */

import { query } from '@/lib/db';
import type { AdvancedReportDefinition } from './types';

let tablesEnsured = false;

export async function ensureAdvancedReportsTables(): Promise<void> {
    if (tablesEnsured) return;
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS tblAgentReports (
                IdReporte INT AUTO_INCREMENT PRIMARY KEY,
                IdUsuario VARCHAR(64) NOT NULL,
                Titulo VARCHAR(300) NOT NULL,
                Descripcion VARCHAR(1000) NULL,
                DefinicionJson LONGTEXT NOT NULL,
                SchemaVersion INT NOT NULL DEFAULT 1,
                EstTokensInput INT NULL,
                EstTokensOutput INT NULL,
                EstCostoUsd DECIMAL(10,4) NULL,
                EstCostoMxn DECIMAL(10,2) NULL,
                RealTokensInput INT NULL,
                RealTokensOutput INT NULL,
                RealCostoUsd DECIMAL(10,4) NULL,
                RealCostoMxn DECIMAL(10,2) NULL,
                UsdMxnRate DECIMAL(10,4) NULL,
                Modelo VARCHAR(50) NULL,
                IdFolder INT NULL,
                FechaCreacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FechaActualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                Eliminado TINYINT NOT NULL DEFAULT 0,
                INDEX IX_AgentReports_Usuario (IdUsuario, Eliminado, FechaCreacion)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS tblAgentReportFolders (
                IdFolder INT AUTO_INCREMENT PRIMARY KEY,
                IdUsuario VARCHAR(64) NOT NULL,
                Nombre VARCHAR(120) NOT NULL,
                FechaCreacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                Eliminado TINYINT NOT NULL DEFAULT 0,
                INDEX IX_ReportFolders_Usuario (IdUsuario, Eliminado, FechaCreacion)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS tblAgentReportRuns (
                IdRun INT AUTO_INCREMENT PRIMARY KEY,
                IdUsuario VARCHAR(64) NOT NULL,
                IdReporte INT NULL,
                Prompt TEXT NULL,
                Modelo VARCHAR(50) NULL,
                Turnos INT NOT NULL DEFAULT 0,
                TokensInput INT NOT NULL DEFAULT 0,
                TokensOutput INT NOT NULL DEFAULT 0,
                TokensCacheRead INT NOT NULL DEFAULT 0,
                TokensCacheWrite INT NOT NULL DEFAULT 0,
                CostoUsd DECIMAL(10,4) NULL,
                CostoMxn DECIMAL(10,2) NULL,
                UsdMxnRate DECIMAL(10,4) NULL,
                EstCostoUsd DECIMAL(10,4) NULL,
                Status VARCHAR(20) NOT NULL DEFAULT 'ok',
                ErrorMsg VARCHAR(500) NULL,
                LatenciaMs INT NULL,
                FechaEvento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX IX_AgentReportRuns_Usuario (IdUsuario, FechaEvento),
                INDEX IX_AgentReportRuns_Reporte (IdReporte)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        tablesEnsured = true;
    } catch (e) {
        console.error('No se pudieron asegurar las tablas de reportes avanzados:', e);
    }
}

function parseJsonSafe<T>(s: string | null | undefined, fallback: T): T {
    if (!s) return fallback;
    try { return JSON.parse(s) as T; } catch { return fallback; }
}

/** mysql2 devuelve un ResultSetHeader en INSERT/UPDATE; aquí extraemos el insertId. */
function insertIdOf(result: unknown): number | null {
    const id = (result as { insertId?: number } | undefined)?.insertId;
    return typeof id === 'number' && id > 0 ? id : null;
}

function toIso(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    return String(value ?? '');
}

export interface ReportCostFields {
    tokensInput?: number;
    tokensOutput?: number;
    costoUsd?: number;
    costoMxn?: number;
}

export interface CreateReportInput {
    userId: string;
    definition: AdvancedReportDefinition;
    est?: ReportCostFields;
    real?: ReportCostFields;
    usdMxnRate?: number;
    model?: string;
}

/** Inserta un reporte y devuelve su IdReporte. */
export async function createReport(input: CreateReportInput): Promise<number> {
    await ensureAdvancedReportsTables();
    const def = input.definition;
    const json = JSON.stringify(def).slice(0, 200000);
    const descripcion = (def.description || '').slice(0, 1000) || null;
    const result = await query(
        `INSERT INTO tblAgentReports
            (IdUsuario, Titulo, Descripcion, DefinicionJson, SchemaVersion,
             EstTokensInput, EstTokensOutput, EstCostoUsd, EstCostoMxn,
             RealTokensInput, RealTokensOutput, RealCostoUsd, RealCostoMxn,
             UsdMxnRate, Modelo, Eliminado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
            input.userId,
            def.title.slice(0, 300),
            descripcion,
            json,
            def.schemaVersion || 1,
            input.est?.tokensInput ?? null,
            input.est?.tokensOutput ?? null,
            input.est?.costoUsd ?? null,
            input.est?.costoMxn ?? null,
            input.real?.tokensInput ?? null,
            input.real?.tokensOutput ?? null,
            input.real?.costoUsd ?? null,
            input.real?.costoMxn ?? null,
            input.usdMxnRate ?? null,
            input.model ?? null,
        ]
    );
    const id = insertIdOf(result);
    if (!id) throw new Error('No se pudo guardar el reporte');
    return id;
}

export interface SavedReportRow {
    idReporte: number;
    idUsuario: string;
    titulo: string;
    descripcion: string | null;
    definition: AdvancedReportDefinition | null;
    estCostoUsd: number | null;
    estCostoMxn: number | null;
    realCostoUsd: number | null;
    realCostoMxn: number | null;
    realTokensInput: number | null;
    realTokensOutput: number | null;
    modelo: string | null;
    idFolder: number | null;
    fechaCreacion: string;
    fechaActualizacion: string;
}

export interface SavedReportListItem {
    idReporte: number;
    titulo: string;
    descripcion: string | null;
    visualization: string | null;
    blockCount: number;            // > 1 = tablero multi-bloque
    realCostoUsd: number | null;
    realCostoMxn: number | null;
    estCostoMxn: number | null;
    modelo: string | null;
    idFolder: number | null;
    fechaCreacion: string;
}

/** Devuelve un reporte completo (con definición parseada) para el visor. */
export async function getReportById(userId: string, idReporte: number): Promise<SavedReportRow | null> {
    await ensureAdvancedReportsTables();
    const rows = await query(
        `SELECT IdReporte, IdUsuario, Titulo, Descripcion, DefinicionJson,
                EstCostoUsd, EstCostoMxn, RealCostoUsd, RealCostoMxn,
                RealTokensInput, RealTokensOutput, Modelo, IdFolder, FechaCreacion, FechaActualizacion
         FROM tblAgentReports
         WHERE IdReporte = ? AND IdUsuario = ? AND Eliminado = 0
         LIMIT 1`,
        [idReporte, userId]
    ) as any[];
    const r = rows[0];
    if (!r) return null;
    return {
        idReporte: r.IdReporte,
        idUsuario: r.IdUsuario,
        titulo: r.Titulo,
        descripcion: r.Descripcion ?? null,
        definition: parseJsonSafe<AdvancedReportDefinition | null>(r.DefinicionJson, null),
        estCostoUsd: r.EstCostoUsd != null ? Number(r.EstCostoUsd) : null,
        estCostoMxn: r.EstCostoMxn != null ? Number(r.EstCostoMxn) : null,
        realCostoUsd: r.RealCostoUsd != null ? Number(r.RealCostoUsd) : null,
        realCostoMxn: r.RealCostoMxn != null ? Number(r.RealCostoMxn) : null,
        realTokensInput: r.RealTokensInput != null ? Number(r.RealTokensInput) : null,
        realTokensOutput: r.RealTokensOutput != null ? Number(r.RealTokensOutput) : null,
        modelo: r.Modelo ?? null,
        idFolder: r.IdFolder != null ? Number(r.IdFolder) : null,
        fechaCreacion: toIso(r.FechaCreacion),
        fechaActualizacion: toIso(r.FechaActualizacion),
    };
}

/** Lista los reportes del usuario para la galería (sin la definición pesada). */
export async function listReportsByUser(userId: string): Promise<SavedReportListItem[]> {
    await ensureAdvancedReportsTables();
    const rows = await query(
        `SELECT IdReporte, Titulo, Descripcion, DefinicionJson,
                EstCostoMxn, RealCostoUsd, RealCostoMxn, Modelo, IdFolder, FechaCreacion
         FROM tblAgentReports
         WHERE IdUsuario = ? AND Eliminado = 0
         ORDER BY FechaCreacion DESC`,
        [userId]
    ) as any[];
    return rows.map((r) => {
        const def = parseJsonSafe<AdvancedReportDefinition | null>(r.DefinicionJson, null);
        return {
            idReporte: r.IdReporte,
            titulo: r.Titulo,
            descripcion: r.Descripcion ?? null,
            visualization: def?.visualization ?? null,
            blockCount: Array.isArray(def?.blocks) ? def!.blocks!.length : 0,
            realCostoUsd: r.RealCostoUsd != null ? Number(r.RealCostoUsd) : null,
            realCostoMxn: r.RealCostoMxn != null ? Number(r.RealCostoMxn) : null,
            estCostoMxn: r.EstCostoMxn != null ? Number(r.EstCostoMxn) : null,
            modelo: r.Modelo ?? null,
            idFolder: r.IdFolder != null ? Number(r.IdFolder) : null,
            fechaCreacion: toIso(r.FechaCreacion),
        };
    });
}

/** Mueve un reporte a una carpeta (folderId null = quitarlo de carpetas). */
export async function moveReport(userId: string, idReporte: number, folderId: number | null): Promise<void> {
    await ensureAdvancedReportsTables();
    await query(
        `UPDATE tblAgentReports SET IdFolder = ? WHERE IdReporte = ? AND IdUsuario = ?`,
        [folderId ?? null, idReporte, userId]
    );
}

/** Clona un reporte (mismo contenido, nombre " (copia)", misma carpeta). */
export async function cloneReport(userId: string, idReporte: number): Promise<number | null> {
    const src = await getReportById(userId, idReporte);
    if (!src?.definition) return null;
    const def: AdvancedReportDefinition = { ...src.definition, title: `${src.titulo} (copia)`.slice(0, 300) };
    const newId = await createReport({
        userId,
        definition: def,
        real: {
            tokensInput: src.realTokensInput ?? undefined,
            tokensOutput: src.realTokensOutput ?? undefined,
            costoUsd: src.realCostoUsd ?? undefined,
            costoMxn: src.realCostoMxn ?? undefined,
        },
        model: src.modelo ?? undefined,
    });
    if (newId && src.idFolder != null) await moveReport(userId, newId, src.idFolder);
    return newId;
}

// ─── Carpetas ───────────────────────────────────────────────────────────────

export interface ReportFolder {
    idFolder: number;
    nombre: string;
}

export async function listFolders(userId: string): Promise<ReportFolder[]> {
    await ensureAdvancedReportsTables();
    const rows = (await query(
        `SELECT IdFolder, Nombre FROM tblAgentReportFolders
         WHERE IdUsuario = ? AND Eliminado = 0 ORDER BY FechaCreacion ASC`,
        [userId]
    )) as any[];
    return rows.map((r) => ({ idFolder: r.IdFolder, nombre: r.Nombre }));
}

export async function createFolder(userId: string, nombre: string): Promise<number | null> {
    await ensureAdvancedReportsTables();
    const result = await query(
        `INSERT INTO tblAgentReportFolders (IdUsuario, Nombre, Eliminado) VALUES (?, ?, 0)`,
        [userId, (nombre || 'Carpeta').slice(0, 120)]
    );
    return insertIdOf(result);
}

/** Borra una carpeta y saca sus reportes a la raíz (no los elimina). */
export async function deleteFolder(userId: string, idFolder: number): Promise<void> {
    await ensureAdvancedReportsTables();
    await query(`UPDATE tblAgentReports SET IdFolder = NULL WHERE IdFolder = ? AND IdUsuario = ?`, [idFolder, userId]);
    await query(`UPDATE tblAgentReportFolders SET Eliminado = 1 WHERE IdFolder = ? AND IdUsuario = ?`, [idFolder, userId]);
}

/** Soft-delete: marca el reporte como eliminado. */
export async function softDeleteReport(userId: string, idReporte: number): Promise<boolean> {
    await ensureAdvancedReportsTables();
    await query(
        `UPDATE tblAgentReports SET Eliminado = 1 WHERE IdReporte = ? AND IdUsuario = ?`,
        [idReporte, userId]
    );
    return true;
}

/** Concilia el costo REAL del reporte tras terminar la ejecución. */
export async function updateReportCost(
    idReporte: number,
    real: ReportCostFields,
    usdMxnRate?: number
): Promise<void> {
    await ensureAdvancedReportsTables();
    await query(
        `UPDATE tblAgentReports
         SET RealTokensInput = ?, RealTokensOutput = ?, RealCostoUsd = ?, RealCostoMxn = ?,
             UsdMxnRate = IFNULL(?, UsdMxnRate)
         WHERE IdReporte = ?`,
        [
            real.tokensInput ?? null,
            real.tokensOutput ?? null,
            real.costoUsd ?? null,
            real.costoMxn ?? null,
            usdMxnRate ?? null,
            idReporte,
        ]
    );
}

/** Actualiza un reporte existente en su lugar (edición por el agente). */
export async function updateReport(
    userId: string,
    idReporte: number,
    definition: AdvancedReportDefinition,
    real?: ReportCostFields,
    model?: string,
    usdMxnRate?: number
): Promise<number> {
    await ensureAdvancedReportsTables();
    const json = JSON.stringify(definition).slice(0, 200000);
    const descripcion = (definition.description || '').slice(0, 1000) || null;
    await query(
        `UPDATE tblAgentReports
            SET Titulo = ?, Descripcion = ?, DefinicionJson = ?, SchemaVersion = ?,
                RealTokensInput = IFNULL(?, RealTokensInput),
                RealTokensOutput = IFNULL(?, RealTokensOutput),
                RealCostoUsd = IFNULL(?, RealCostoUsd),
                RealCostoMxn = IFNULL(?, RealCostoMxn),
                UsdMxnRate = IFNULL(?, UsdMxnRate),
                Modelo = IFNULL(?, Modelo)
          WHERE IdReporte = ? AND IdUsuario = ? AND Eliminado = 0`,
        [
            definition.title.slice(0, 300),
            descripcion,
            json,
            definition.schemaVersion || 1,
            real?.tokensInput ?? null,
            real?.tokensOutput ?? null,
            real?.costoUsd ?? null,
            real?.costoMxn ?? null,
            usdMxnRate ?? null,
            model ?? null,
            idReporte,
            userId,
        ]
    );
    return idReporte;
}

export interface ReportRunInput {
    userId: string;
    idReporte?: number | null;
    prompt?: string;
    model?: string;
    turnos: number;
    tokensInput: number;
    tokensOutput: number;
    tokensCacheRead?: number;
    tokensCacheWrite?: number;
    costoUsd?: number;
    costoMxn?: number;
    usdMxnRate?: number;
    estCostoUsd?: number;
    status?: string;
    errorMsg?: string;
    latenciaMs?: number;
}

/** Registra una ejecución del agente avanzado (auditoría de gasto). */
export async function insertReportRun(run: ReportRunInput): Promise<number | null> {
    await ensureAdvancedReportsTables();
    try {
        const result = await query(
            `INSERT INTO tblAgentReportRuns
                (IdUsuario, IdReporte, Prompt, Modelo, Turnos,
                 TokensInput, TokensOutput, TokensCacheRead, TokensCacheWrite,
                 CostoUsd, CostoMxn, UsdMxnRate, EstCostoUsd, Status, ErrorMsg, LatenciaMs)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                run.userId,
                run.idReporte ?? null,
                (run.prompt || '').slice(0, 8000) || null,
                run.model?.slice(0, 50) ?? null,
                run.turnos,
                run.tokensInput,
                run.tokensOutput,
                run.tokensCacheRead ?? 0,
                run.tokensCacheWrite ?? 0,
                run.costoUsd ?? null,
                run.costoMxn ?? null,
                run.usdMxnRate ?? null,
                run.estCostoUsd ?? null,
                run.status ?? 'ok',
                run.errorMsg?.slice(0, 500) ?? null,
                run.latenciaMs ?? null,
            ]
        );
        return insertIdOf(result);
    } catch (e) {
        console.error('insertReportRun failed:', e);
        return null;
    }
}
