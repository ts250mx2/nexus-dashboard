/**
 * CIERRES DE INVENTARIO: foto diaria del inventario de cada sucursal, guardada
 * en un esquema propio del portal (por omisión `BDNexusWeb`) para poder
 * comparar el inventario de hoy con el de los días anteriores.
 *
 * Cada cierre guarda, por artículo, exactamente lo que muestra la pantalla de
 * Existencias en ese momento: existencia inicial (corte del ERP), entradas,
 * salidas, existencia final, costo y consignación. Se conservan el cierre de
 * hoy y los RETENCION_DIAS anteriores; lo más viejo se purga tras cada cierre.
 *
 * Es la ÚNICA escritura que hace el portal en el servidor MySQL, y solo en su
 * propio esquema. Cada sucursal se guarda en una transacción (InnoDB): o queda
 * completa o no queda.
 */

import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { toIso } from '@/lib/dates';
import { getPool, query } from '@/lib/db';
import { getErrorMessage } from '@/lib/errors';
import {
    CierreDia,
    Comparacion,
    DetalleCierre,
    HoyEnVivo,
    compararCierres,
} from './cierres-comparar';
import { fechaCorteComun, fechaGeneracionMovimientos } from './erp';
import { ExistenciaRow, buildExistenciasQuery } from './existencias';
import { totalizar } from './existencias-view';
import { SucursalInventario, listarSucursalesInventario } from './sucursales';

/** Días anteriores a hoy que se conservan. */
export const RETENCION_DIAS = 3;

/**
 * Antes de esta hora local, una corrida en la que la sucursal todavía no tiene
 * corte del día (el ERP regenera ~02:06) es la foto del día que acaba de cerrar:
 * se atribuye al día anterior y sus documentos se acotan a la medianoche.
 */
const HORA_LIMITE_DIA_ANTERIOR = 3;
/** Si más de esta fracción de artículos no tiene corte, el ERP está regenerando la tabla: no se guarda. */
const MAX_FRACCION_SIN_CORTE = 0.01;

let enCurso: Promise<ResultadoCierre> | null = null;

/** Verdadero mientras una corrida de cierre está en marcha en este proceso. */
export function cierreEnCurso(): boolean {
    return enCurso !== null;
}

const ESQUEMA = process.env.CIERRES_SCHEMA || 'BDNexusWeb';
if (!/^[A-Za-z0-9_]+$/.test(ESQUEMA)) {
    throw new Error(`CIERRES_SCHEMA inválido: ${ESQUEMA}`);
}

const T_CIERRE = `${ESQUEMA}.inventario_cierre`;
const T_DETALLE = `${ESQUEMA}.inventario_cierre_detalle`;
/** Renglones por INSERT masivo. */
const LOTE = 500;
const MAX_TEXTO = { Codigo: 60, Descripcion: 200, Marca: 80, Depto: 80, Sucursal: 80, Error: 2000 };

const DDL = [
    `CREATE DATABASE IF NOT EXISTS ${ESQUEMA} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS ${T_CIERRE} (
        IdCierre        INT AUTO_INCREMENT PRIMARY KEY,
        Fecha           DATE         NOT NULL,
        IdSucursal      INT          NOT NULL,
        Sucursal        VARCHAR(80)  NOT NULL,
        GeneradoEn      DATETIME     NOT NULL,
        FechaCorteERP   DATETIME     NULL,
        CorteGeneradoEn DATETIME     NULL,
        Articulos       INT          NOT NULL DEFAULT 0,
        ConExistencia   INT          NOT NULL DEFAULT 0,
        Negativos       INT          NOT NULL DEFAULT 0,
        ConMovimiento   INT          NOT NULL DEFAULT 0,
        Unidades        DOUBLE       NOT NULL DEFAULT 0,
        Entradas        DOUBLE       NOT NULL DEFAULT 0,
        Salidas         DOUBLE       NOT NULL DEFAULT 0,
        Valor           DOUBLE       NOT NULL DEFAULT 0,
        DuracionMs      INT          NOT NULL DEFAULT 0,
        Ok              TINYINT      NOT NULL DEFAULT 0,
        Error           TEXT         NULL,
        UNIQUE KEY uq_fecha_sucursal (Fecha, IdSucursal)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS ${T_DETALLE} (
        IdCierre            INT          NOT NULL,
        IdArticulo          INT          NOT NULL,
        Codigo              VARCHAR(60)  NOT NULL,
        Descripcion         VARCHAR(200) NOT NULL,
        Marca               VARCHAR(80)  NOT NULL DEFAULT '',
        Depto               VARCHAR(80)  NOT NULL DEFAULT '',
        ExiInicial          DOUBLE       NOT NULL,
        Entradas            DOUBLE       NOT NULL,
        Salidas             DOUBLE       NOT NULL,
        ExiFinal            DOUBLE       NOT NULL,
        Costo               DOUBLE       NOT NULL,
        Consignacion        DOUBLE       NOT NULL DEFAULT 0,
        UltimaActualizacion DATETIME     NULL,
        Fuente              VARCHAR(20)  NOT NULL DEFAULT 'movimientos',
        PRIMARY KEY (IdCierre, IdArticulo),
        KEY ix_articulo (IdArticulo),
        CONSTRAINT fk_cierre_detalle FOREIGN KEY (IdCierre)
            REFERENCES ${T_CIERRE} (IdCierre) ON DELETE CASCADE
    ) ENGINE=InnoDB`,
];

let esquemaListo: Promise<void> | null = null;

/** Crea el esquema y las tablas si no existen (idempotente, una vez por proceso). */
export function ensureCierresSchema(): Promise<void> {
    if (!esquemaListo) {
        esquemaListo = (async () => {
            const pool = await getPool();
            for (const sentencia of DDL) await pool.query(sentencia);
        })().catch(err => {
            esquemaListo = null;
            throw err;
        });
    }
    return esquemaListo;
}

const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const texto = (v: unknown, max: number): string => String(v ?? '').slice(0, max);

/** DATE de mysql2 (Date a medianoche local) o texto → 'YYYY-MM-DD'. */
function fechaLocal(v: unknown): string {
    if (v instanceof Date) {
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, '0');
        const d = String(v.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return String(v ?? '').slice(0, 10);
}

/** ISO → Date para parámetros DATETIME (mysql2 la formatea en hora local). */
function aFecha(iso: string | null): Date | null {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** 'YYYY-MM-DD' → el día anterior, en calendario local. */
function diaAnterior(fecha: string): string {
    const d = new Date(`${fecha}T00:00:00`);
    d.setDate(d.getDate() - 1);
    return fechaLocal(d);
}

function aFuente(v: unknown): DetalleCierre['Fuente'] {
    return v === 'conteo' || v === 'costo' ? v : 'movimientos';
}

function aDetalle(r: ExistenciaRow): DetalleCierre {
    return {
        IdArticulo: num(r.IdArticulo),
        Codigo: texto(r.Codigo, MAX_TEXTO.Codigo),
        Descripcion: texto(r.Descripcion, MAX_TEXTO.Descripcion),
        Marca: texto(r.Marca, MAX_TEXTO.Marca),
        Depto: texto(r.Depto, MAX_TEXTO.Depto),
        ExiInicial: num(r.ExiInicial),
        Entradas: num(r.Entradas),
        Salidas: num(r.Salidas),
        ExiFinal: num(r.ExiFinal),
        Costo: num(r.Costo),
        Consignacion: num(r.Consignacion),
        Fuente: aFuente(r.Fuente),
    };
}

export interface CierreSucursalResumen {
    IdSucursal: number;
    Sucursal: string;
    /** Día de negocio al que se atribuyó la foto. */
    fecha: string;
    ok: boolean;
    error?: string;
    /** Falló el intento pero se conservó el cierre bueno que ya existía para ese día. */
    conservadoAnterior?: boolean;
    articulos: number;
    unidades: number;
    valor: number;
    negativos: number;
    conMovimiento: number;
    duracionMs: number;
    fechaCorteERP: string | null;
}

export interface ResultadoCierre {
    fecha: string;
    generadoEn: string;
    corteGeneradoEn: string | null;
    sucursales: CierreSucursalResumen[];
    purgados: number;
}

interface CabeceraInsert {
    fecha: string;
    sucursal: SucursalInventario;
    generadoEn: string;
    fechaCorteERP: string | null;
    corteGeneradoEn: string | null;
    duracionMs: number;
}

async function guardarSucursal(cab: CabeceraInsert, rows: ExistenciaRow[]): Promise<CierreSucursalResumen> {
    const pool = await getPool();
    const conn: PoolConnection = await pool.getConnection();
    const tot = totalizar(rows);
    try {
        await conn.beginTransaction();
        await conn.query(`DELETE FROM ${T_CIERRE} WHERE Fecha = ? AND IdSucursal = ?`, [cab.fecha, cab.sucursal.IdSucursal]);

        const [res] = await conn.query<ResultSetHeader>(
            `INSERT INTO ${T_CIERRE}
                (Fecha, IdSucursal, Sucursal, GeneradoEn, FechaCorteERP, CorteGeneradoEn,
                 Articulos, ConExistencia, Negativos, ConMovimiento, Unidades, Entradas, Salidas, Valor, DuracionMs, Ok)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
                cab.fecha,
                cab.sucursal.IdSucursal,
                texto(cab.sucursal.Sucursal, MAX_TEXTO.Sucursal),
                aFecha(cab.generadoEn),
                aFecha(cab.fechaCorteERP),
                aFecha(cab.corteGeneradoEn),
                tot.registros,
                tot.conExistencia,
                tot.negativos,
                rows.filter(r => num(r.Entradas) > 0 || num(r.Salidas) > 0).length,
                tot.exiFinal,
                tot.entradas,
                tot.salidas,
                tot.total,
                cab.duracionMs,
            ]
        );
        const idCierre = res.insertId;

        for (let i = 0; i < rows.length; i += LOTE) {
            const valores = rows.slice(i, i + LOTE).map(r => {
                const d = aDetalle(r);
                return [
                    idCierre, d.IdArticulo, d.Codigo, d.Descripcion, d.Marca, d.Depto,
                    d.ExiInicial, d.Entradas, d.Salidas, d.ExiFinal, d.Costo, d.Consignacion,
                    aFecha(toIso(r.UltimaActualizacion)), texto(r.Fuente, 20),
                ];
            });
            await conn.query(
                `INSERT INTO ${T_DETALLE}
                    (IdCierre, IdArticulo, Codigo, Descripcion, Marca, Depto,
                     ExiInicial, Entradas, Salidas, ExiFinal, Costo, Consignacion, UltimaActualizacion, Fuente)
                 VALUES ?`,
                [valores]
            );
        }

        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }

    return {
        IdSucursal: cab.sucursal.IdSucursal,
        Sucursal: cab.sucursal.Sucursal,
        fecha: cab.fecha,
        ok: true,
        articulos: tot.registros,
        unidades: tot.exiFinal,
        valor: tot.total,
        negativos: tot.negativos,
        conMovimiento: rows.filter(r => num(r.Entradas) > 0 || num(r.Salidas) > 0).length,
        duracionMs: cab.duracionMs,
        fechaCorteERP: cab.fechaCorteERP,
    };
}

/**
 * Deja constancia del fallo SIN destruir un cierre bueno: si ya hay una foto
 * Ok = 1 para ese día y sucursal, se conserva y solo se informa; si no, se
 * registra la fila de error (sustituyendo un error anterior). Todo en una
 * transacción, para que un servidor caído no deje el día sin ninguna fila.
 * Devuelve true si se conservó un cierre bueno previo.
 */
async function registrarError(cab: CabeceraInsert, error: string): Promise<boolean> {
    const pool = await getPool();
    const conn: PoolConnection = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [previos] = await conn.query<RowDataPacket[]>(
            `SELECT IdCierre FROM ${T_CIERRE} WHERE Fecha = ? AND IdSucursal = ? AND Ok = 1 FOR UPDATE`,
            [cab.fecha, cab.sucursal.IdSucursal]
        );
        if (previos.length > 0) {
            await conn.commit();
            return true;
        }
        await conn.query(`DELETE FROM ${T_CIERRE} WHERE Fecha = ? AND IdSucursal = ? AND Ok = 0`, [cab.fecha, cab.sucursal.IdSucursal]);
        await conn.query(
            `INSERT INTO ${T_CIERRE} (Fecha, IdSucursal, Sucursal, GeneradoEn, CorteGeneradoEn, DuracionMs, Ok, Error)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
            [
                cab.fecha,
                cab.sucursal.IdSucursal,
                texto(cab.sucursal.Sucursal, MAX_TEXTO.Sucursal),
                aFecha(cab.generadoEn),
                aFecha(cab.corteGeneradoEn),
                cab.duracionMs,
                texto(error, MAX_TEXTO.Error),
            ]
        );
        await conn.commit();
        return false;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/** 'YYYY-MM-DD' del último corte de cada sucursal (tblSucursales.FechaCorteInv). */
async function fechasCortePorSucursal(): Promise<Map<number, string | null>> {
    const rows = (await query('SELECT IdSucursal, FechaCorteInv FROM tblSucursales')) as { IdSucursal: unknown; FechaCorteInv: unknown }[];
    return new Map(rows.map(r => [num(r.IdSucursal), r.FechaCorteInv ? fechaLocal(r.FechaCorteInv) : null]));
}

/** Borra los cierres anteriores a la ventana de retención. Devuelve cuántas cabeceras se fueron. */
async function purgarCierres(fecha: string): Promise<number> {
    const pool = await getPool();
    const [res] = await pool.query<ResultSetHeader>(
        `DELETE FROM ${T_CIERRE} WHERE Fecha < DATE_SUB(?, INTERVAL ${RETENCION_DIAS} DAY)`,
        [fecha]
    );
    return res.affectedRows;
}

/**
 * Toma la foto del día de cada sucursal (o de las indicadas). Solo corre una a
 * la vez por proceso: una segunda llamada concurrente recibe la misma promesa.
 */
export function generarCierre(opts: { sucursales?: number[] } = {}): Promise<ResultadoCierre> {
    if (enCurso) return enCurso;
    enCurso = ejecutarCierre(opts).finally(() => {
        enCurso = null;
    });
    return enCurso;
}

/** Las sucursales se procesan en serie para no saturar el pool: cada una tarda 1-5 s. */
async function ejecutarCierre(opts: { sucursales?: number[] }): Promise<ResultadoCierre> {
    await ensureCierresSchema();
    const pool = await getPool();

    const [reloj] = await pool.query<RowDataPacket[]>('SELECT CURDATE() AS Hoy, NOW() AS Ahora, HOUR(NOW()) AS Hora');
    const hoy = fechaLocal(reloj[0]?.Hoy);
    const hora = num(reloj[0]?.Hora);
    const generadoEn = toIso(reloj[0]?.Ahora) ?? new Date().toISOString();
    const corteGeneradoEn = await fechaGeneracionMovimientos();
    const cortes = await fechasCortePorSucursal();

    const filtro = new Set(opts.sucursales ?? []);
    const sucursales = (await listarSucursalesInventario()).filter(s => filtro.size === 0 || filtro.has(s.IdSucursal));

    const resultados: CierreSucursalResumen[] = [];
    for (const sucursal of sucursales) {
        const t0 = Date.now();

        // Día de negocio: de madrugada, si el ERP aún no generó el corte de hoy para
        // esta sucursal, la foto es la del día que acaba de cerrar.
        const corteDia = cortes.get(sucursal.IdSucursal) ?? null;
        const esDiaAnterior = hora < HORA_LIMITE_DIA_ANTERIOR && corteDia !== null && corteDia < hoy;
        const fecha = esDiaAnterior ? diaAnterior(hoy) : hoy;
        const ventana = esDiaAnterior ? { hasta: `'${hoy} 00:00:00'` } : {};

        const cab: CabeceraInsert = { fecha, sucursal, generadoEn, fechaCorteERP: null, corteGeneradoEn, duracionMs: 0 };
        try {
            const rows = (await query(buildExistenciasQuery(sucursal.IdSucursal, ventana))) as ExistenciaRow[];
            const sinCorte = rows.filter(r => r.Fuente === 'costo').length;
            if (rows.length > 0 && sinCorte / rows.length > MAX_FRACCION_SIN_CORTE) {
                throw new Error(`El corte del ERP no está completo (${sinCorte} de ${rows.length} artículos sin corte; regeneración en curso). No se guardó.`);
            }
            cab.fechaCorteERP = fechaCorteComun(rows);
            cab.duracionMs = Date.now() - t0;
            resultados.push(await guardarSucursal(cab, rows));
        } catch (err: unknown) {
            const mensaje = getErrorMessage(err, 'Error desconocido');
            console.error(`Cierre de inventario: falló ${sucursal.Sucursal}:`, err);
            cab.duracionMs = Date.now() - t0;
            const conservadoAnterior = await registrarError(cab, mensaje).catch(e => {
                console.error('No se pudo registrar el error del cierre:', e);
                return false;
            });
            resultados.push({
                IdSucursal: sucursal.IdSucursal,
                Sucursal: sucursal.Sucursal,
                fecha,
                ok: false,
                error: mensaje,
                conservadoAnterior,
                articulos: 0,
                unidades: 0,
                valor: 0,
                negativos: 0,
                conMovimiento: 0,
                duracionMs: cab.duracionMs,
                fechaCorteERP: null,
            });
        }
    }

    const purgados = await purgarCierres(hoy);
    return { fecha: hoy, generadoEn, corteGeneradoEn, sucursales: resultados, purgados };
}

export interface CierreListado {
    IdCierre: number;
    fecha: string;
    IdSucursal: number;
    Sucursal: string;
    generadoEn: string;
    fechaCorteERP: string | null;
    corteGeneradoEn: string | null;
    articulos: number;
    conExistencia: number;
    negativos: number;
    conMovimiento: number;
    unidades: number;
    entradas: number;
    salidas: number;
    valor: number;
    duracionMs: number;
    ok: boolean;
    error: string | null;
}

function aListado(r: RowDataPacket): CierreListado {
    return {
        IdCierre: num(r.IdCierre),
        fecha: fechaLocal(r.Fecha),
        IdSucursal: num(r.IdSucursal),
        Sucursal: String(r.Sucursal ?? ''),
        generadoEn: toIso(r.GeneradoEn) ?? '',
        fechaCorteERP: toIso(r.FechaCorteERP),
        corteGeneradoEn: toIso(r.CorteGeneradoEn),
        articulos: num(r.Articulos),
        conExistencia: num(r.ConExistencia),
        negativos: num(r.Negativos),
        conMovimiento: num(r.ConMovimiento),
        unidades: num(r.Unidades),
        entradas: num(r.Entradas),
        salidas: num(r.Salidas),
        valor: num(r.Valor),
        duracionMs: num(r.DuracionMs),
        ok: num(r.Ok) === 1,
        error: r.Error ? String(r.Error) : null,
    };
}

/** Cabeceras de todos los cierres conservados, del más reciente al más antiguo. */
export async function listarCierres(): Promise<CierreListado[]> {
    await ensureCierresSchema();
    const pool = await getPool();
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM ${T_CIERRE} ORDER BY Fecha DESC, Sucursal`);
    return rows.map(aListado);
}

/** Cierres completos (con detalle) de una sucursal, del más antiguo al más reciente. */
export async function cargarCierresSucursal(sucursal: number): Promise<CierreDia[]> {
    await ensureCierresSchema();
    const pool = await getPool();
    const [cabeceras] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM ${T_CIERRE} WHERE IdSucursal = ? AND Ok = 1 ORDER BY Fecha DESC LIMIT ${RETENCION_DIAS + 1}`,
        [sucursal]
    );
    if (cabeceras.length === 0) return [];

    const ids = cabeceras.map(c => num(c.IdCierre));
    const [detalles] = await pool.query<RowDataPacket[]>(
        `SELECT IdCierre, IdArticulo, Codigo, Descripcion, Marca, Depto,
                ExiInicial, Entradas, Salidas, ExiFinal, Costo, Consignacion, Fuente
         FROM ${T_DETALLE} WHERE IdCierre IN (?)`,
        [ids]
    );

    const porCierre = new Map<number, DetalleCierre[]>();
    for (const d of detalles) {
        const lista = porCierre.get(num(d.IdCierre)) ?? [];
        lista.push({
            IdArticulo: num(d.IdArticulo),
            Codigo: String(d.Codigo ?? ''),
            Descripcion: String(d.Descripcion ?? ''),
            Marca: String(d.Marca ?? ''),
            Depto: String(d.Depto ?? ''),
            ExiInicial: num(d.ExiInicial),
            Entradas: num(d.Entradas),
            Salidas: num(d.Salidas),
            ExiFinal: num(d.ExiFinal),
            Costo: num(d.Costo),
            Consignacion: num(d.Consignacion),
            Fuente: aFuente(d.Fuente),
        });
        porCierre.set(num(d.IdCierre), lista);
    }

    return cabeceras
        .map(c => ({
            fecha: fechaLocal(c.Fecha),
            generadoEn: toIso(c.GeneradoEn) ?? '',
            fechaCorteERP: toIso(c.FechaCorteERP),
            corteGeneradoEn: toIso(c.CorteGeneradoEn),
            detalle: porCierre.get(num(c.IdCierre)) ?? [],
        }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export interface ComparacionConHoy {
    sucursal: number;
    corteGeneradoEn: string | null;
    hoy: { fecha: string; calculadoEn: string; fechaCorteERP: string | null; articulos: number };
    cierres: { fecha: string; generadoEn: string; articulos: number }[];
    comparacion: Comparacion;
}

/** Cierres guardados de la sucursal frente al inventario de hoy calculado en vivo. */
export async function compararConHoy(sucursal: number): Promise<ComparacionConHoy> {
    const [dias, rows, corteGeneradoEn] = await Promise.all([
        cargarCierresSucursal(sucursal),
        query(buildExistenciasQuery(sucursal)) as Promise<ExistenciaRow[]>,
        fechaGeneracionMovimientos(),
    ]);

    const ahora = new Date();
    const hoy: HoyEnVivo = {
        fecha: fechaLocal(ahora),
        calculadoEn: ahora.toISOString(),
        fechaCorteERP: fechaCorteComun(rows),
        corteGeneradoEn,
        detalle: rows.map(aDetalle),
    };

    // El cierre de HOY (si ya se tomó) no se compara contra hoy en vivo: son la
    // misma foto tomada a distinta hora y arrancan del mismo corte.
    const diasPrevios = dias.filter(d => d.fecha < hoy.fecha);

    return {
        sucursal,
        corteGeneradoEn,
        hoy: { fecha: hoy.fecha, calculadoEn: hoy.calculadoEn, fechaCorteERP: hoy.fechaCorteERP, articulos: rows.length },
        cierres: dias.map(d => ({ fecha: d.fecha, generadoEn: d.generadoEn, articulos: d.detalle.length })),
        comparacion: compararCierres(diasPrevios, hoy),
    };
}
