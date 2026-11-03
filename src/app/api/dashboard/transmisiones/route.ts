import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { toIso } from '@/lib/dates';
import { query } from '@/lib/db';
import { getErrorMessage } from '@/lib/errors';
import { SUCURSAL_EXCLUSION } from '@/lib/inventory/source';
import { FuenteSenal, ultimaSenal } from '@/lib/transmisiones';

/**
 * MONITOR DE TRANSMISIONES
 *
 * Última señal de cada sucursal al servidor central: la más reciente entre el
 * registro de transmisión de sus computadoras y la llegada de su último ticket
 * (ver src/lib/transmisiones.ts). El nivel de alerta lo calcula la pantalla con
 * `segundos`, que se mide contra el reloj de la base.
 *
 * El último ticket recibido sale de MAX(FechaAct) en tblVentas, que no tiene
 * índice por fecha: ~1.3 s. Por eso el resultado se guarda CACHE_MS en el
 * servidor y se comparte entre todos los que tengan el panel abierto.
 */

const CACHE_MS = 60_000;
/** Computadoras que se listan por sucursal: las que transmitieron en estos días. */
const DIAS_COMPUTADORAS = 7;

export interface ComputadoraTransmision {
    Computadora: string;
    Version: string | null;
    FechaTransmision: string | null;
    segundos: number | null;
}

export interface SucursalTransmision {
    IdSucursal: number;
    Sucursal: string;
    ultimaTransmision: string | null;
    ultimoTicket: string | null;
    /** La más reciente de las dos, y de cuál salió. */
    ultima: string | null;
    fuente: FuenteSenal | null;
    /** Segundos desde la última señal hasta el reloj de la base. */
    segundos: number | null;
    computadoras: ComputadoraTransmision[];
}

export interface TransmisionesResponse {
    success: true;
    generadoEn: string;
    sucursales: SucursalTransmision[];
}

type Fila = Record<string, unknown>;

let cache: { at: number; data: TransmisionesResponse } | null = null;
let enCurso: Promise<TransmisionesResponse> | null = null;

const segundosEntre = (desde: string | null, hasta: number): number | null => {
    if (!desde) return null;
    const t = Date.parse(desde);
    return Number.isNaN(t) ? null : Math.max(0, Math.round((hasta - t) / 1000));
};

async function calcular(): Promise<TransmisionesResponse> {
    // En serie a propósito: el pool es de 10 conexiones para toda la app.
    const ahoraRows = (await query('SELECT NOW() AS Ahora')) as Fila[];
    const ahora = Date.parse(toIso(ahoraRows[0]?.Ahora) ?? '');

    const sucursales = (await query(`
        SELECT S.IdSucursal, S.Sucursal, T.UltimaTransmision, V.UltimoTicket
        FROM tblSucursales S
        LEFT JOIN (
            SELECT IdSucursal, MAX(FechaTransmision) AS UltimaTransmision
            FROM tblSucursalesTransmisiones
            WHERE FechaTransmision <= NOW()
            GROUP BY IdSucursal
        ) T ON T.IdSucursal = S.IdSucursal
        LEFT JOIN (
            -- Topado en NOW(): la base trae tickets con fechas futuras.
            SELECT IdSucursal, MAX(FechaAct) AS UltimoTicket
            FROM tblVentas
            WHERE FechaAct <= NOW()
            GROUP BY IdSucursal
        ) V ON V.IdSucursal = S.IdSucursal
        WHERE ${SUCURSAL_EXCLUSION}
        ORDER BY S.IdSucursal`)) as Fila[];

    const computadoras = (await query(`
        SELECT IdSucursal, Computadora, Version, FechaTransmision
        FROM tblSucursalesTransmisiones
        WHERE FechaTransmision >= NOW() - INTERVAL ${DIAS_COMPUTADORAS} DAY
          AND FechaTransmision <= NOW()
        ORDER BY FechaTransmision DESC`)) as Fila[];

    const porSucursal = new Map<number, ComputadoraTransmision[]>();
    for (const c of computadoras) {
        const id = Number(c.IdSucursal);
        const fecha = toIso(c.FechaTransmision);
        const lista = porSucursal.get(id) ?? [];
        lista.push({
            Computadora: String(c.Computadora ?? ''),
            Version: c.Version ? String(c.Version) : null,
            FechaTransmision: fecha,
            segundos: segundosEntre(fecha, ahora),
        });
        porSucursal.set(id, lista);
    }

    return {
        success: true,
        generadoEn: new Date().toISOString(),
        sucursales: sucursales.map(s => {
            const id = Number(s.IdSucursal);
            const ultimaTransmision = toIso(s.UltimaTransmision);
            const ultimoTicket = toIso(s.UltimoTicket);
            const { fecha, fuente } = ultimaSenal({ transmision: ultimaTransmision, ticket: ultimoTicket });
            return {
                IdSucursal: id,
                Sucursal: String(s.Sucursal ?? ''),
                ultimaTransmision,
                ultimoTicket,
                ultima: fecha,
                fuente,
                segundos: segundosEntre(fecha, ahora),
                computadoras: porSucursal.get(id) ?? [],
            };
        }),
    };
}

export async function GET() {
    if ((await getSession().catch(() => null)) === null) {
        return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }
    try {
        if (cache && Date.now() - cache.at < CACHE_MS) return NextResponse.json(cache.data);

        // Si ya hay un cálculo en curso, se comparte en vez de lanzar otro.
        enCurso ??= calcular().finally(() => { enCurso = null; });
        const data = await enCurso;
        cache = { at: Date.now(), data };
        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error('Error en monitor de transmisiones:', getErrorMessage(error), error);
        return NextResponse.json(
            { success: false, error: 'No se pudo consultar la última transmisión de las sucursales' },
            { status: 500 }
        );
    }
}
