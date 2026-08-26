/**
 * Reporte de MOVIMIENTOS de un artículo en una sucursal. Réplica de la pantalla
 * "Reporte Movimientos" (frmRepMovimientos) del ERP en el modo con que se abre
 * desde "Existencia de artículos" (vgEsFechas = 0): sin rango de fechas y con
 * el interruptor "Ver todos".
 *
 * Reglas del ERP que se replican tal cual:
 *   - Solo renglones vigentes (Status = 0).
 *   - Por omisión solo lo posterior al último ajuste físico (EfectoInventario = 1);
 *     "Ver todos" quita ese filtro y muestra la historia completa del par.
 *   - Ajustes (tipo 0): el movimiento es la diferencia aplicada (`Ajuste`), no el
 *     conteo (`Mov`). Se listan aunque la diferencia sea cero.
 *   - Corte tipo 99: se lista como marcador "INVENTARIO A FECHA" con Mov = 0.
 *   - Resto de tipos: se omiten los renglones con Mov = 0.
 *   - El saldo por renglón (existencia después del movimiento) se reconstruye de
 *     atrás hacia adelante desde la existencia actual; ver ./movimientos-view.ts.
 *     Verificado 2026-08-25: ese recorrido, consignaciones (tipo 6) incluidas,
 *     reproduce el corte 99 del ERP.
 *
 * Los movimientos se topan con NOW() porque la base contiene tickets con fecha
 * futura. La lectura va por el índice (IdArticulo, IdSucursal): milisegundos
 * incluso para los artículos con más historia (~18 mil renglones).
 *
 * Todas las consultas son SOLO LECTURA y llevan los IDs como parámetros.
 */

import type { CorteInfo, MovimientoBase, ResumenTipo } from './movimientos-view';

/**
 * Tope defensivo de renglones por consulta. El par más movido hoy ronda los
 * 18 mil; el tope solo actúa como cortacircuito si la tabla crece sin control.
 * Se conservan los MÁS RECIENTES para que el saldo por renglón (que se ancla en
 * la existencia actual) siga siendo correcto aunque se recorte la historia.
 */
export const MAX_RENGLONES = 50_000;

export interface MovimientoRow extends MovimientoBase {
    /** Con TipoMovimiento, Folio e Iteracion forma la llave primaria del renglón. */
    IdComputadora: number;
    Folio: number;
    Iteracion: number;
    Concepto: string;
    IdUsuario: number;
    Usuario: string | null;
    /** Última modificación del renglón en el ERP (ISO 8601). */
    FechaAct: string | null;
    /** Saldo después del movimiento; lo calcula el servidor (ver ./movimientos-view). */
    Exi: number;
}

export interface ArticuloSucursalInfo extends CorteInfo {
    IdArticulo: number;
    Codigo: string;
    Descripcion: string;
    IdSucursal: number;
    Sucursal: string;
    /** Existencia de respaldo (tblCostoInventario) cuando el par no tiene corte. */
    ExiCosto: number | null;
}

export interface MovimientosMeta extends ArticuloSucursalInfo {
    /** Existencia actual: corte + movimientos posteriores. Ancla del saldo por renglón. */
    exiFinal: number;
    verTodos: boolean;
    /** La historia superó MAX_RENGLONES y se recortaron los más antiguos. */
    truncado: boolean;
    calculadoEn: string;
}

export interface MovimientosResponse {
    meta: MovimientosMeta;
    resumen: ResumenTipo[];
    movimientos: MovimientoRow[];
}

export interface SqlConParams {
    sql: string;
    params: number[];
}

function validarPar(articulo: number, sucursal: number): void {
    if (!Number.isInteger(articulo) || articulo <= 0 || !Number.isInteger(sucursal) || sucursal <= 0) {
        throw new Error('El reporte de movimientos requiere un artículo y una sucursal válidos');
    }
}

/**
 * Encabezado del reporte: artículo, sucursal, último corte tipo 99 del par y la
 * existencia de respaldo de tblCostoInventario.
 */
export function buildArticuloSucursalQuery(articulo: number, sucursal: number): SqlConParams {
    validarPar(articulo, sucursal);
    return {
        sql: `
SELECT
    A.IdArticulo,
    COALESCE(A.Codigo, A.CodigoBarras, 'S/C')                              AS Codigo,
    COALESCE(NULLIF(A.Descripcion, ''), A.Producto, 'Artículo sin nombre') AS Descripcion,
    S.IdSucursal,
    S.Sucursal,
    C.Mov             AS ExiCorte,
    C.FechaMovimiento AS FechaCorte,
    CI.Exi            AS ExiCosto
FROM tblArticulos A
INNER JOIN tblSucursales S ON S.IdSucursal = ?
LEFT JOIN tblCostoInventario CI
       ON CI.IdArticulo = A.IdArticulo
      AND CI.IdSucursal = S.IdSucursal
LEFT JOIN (
    SELECT IdArticulo, IdSucursal, Mov, FechaMovimiento
    FROM tblReporteMovimientos
    WHERE IdArticulo = ? AND IdSucursal = ? AND TipoMovimiento = 99
    ORDER BY FechaMovimiento DESC, Iteracion DESC, Folio DESC
    LIMIT 1
) C ON C.IdArticulo = A.IdArticulo AND C.IdSucursal = S.IdSucursal
WHERE A.IdArticulo = ?`,
        params: [sucursal, articulo, sucursal, articulo],
    };
}

/**
 * Movimientos del par, del MÁS RECIENTE al más antiguo (para que el LIMIT
 * recorte la historia vieja); el consumidor los invierte a orden cronológico.
 * `Mov` ya viene ajustado por tipo (ajuste → diferencia, corte → 0) y `Editado`
 * marca los renglones modificados en un día distinto al del movimiento
 * (columna "Editados" del ERP).
 */
export function buildMovimientosQuery(articulo: number, sucursal: number, verTodos: boolean): SqlConParams {
    validarPar(articulo, sucursal);
    const filtroEfecto = verTodos
        ? ''
        : '\n  AND (M.TipoMovimiento = 99 OR IFNULL(M.EfectoInventario, 0) = 1)';
    return {
        sql: `
SELECT
    M.IdComputadora,
    M.TipoMovimiento,
    M.Folio,
    M.Iteracion,
    IFNULL(M.Concepto, '') AS Concepto,
    CASE
        WHEN M.TipoMovimiento = 0  THEN IFNULL(M.Ajuste, 0)
        WHEN M.TipoMovimiento = 99 THEN 0
        ELSE IFNULL(M.Mov, 0)
    END                    AS Mov,
    IFNULL(M.IdUsuario, 0) AS IdUsuario,
    U.Usuario,
    M.FechaMovimiento,
    M.FechaAct,
    DATE_FORMAT(M.FechaMovimiento, '%Y-%m-%d') AS Dia,
    CASE
        WHEN M.TipoMovimiento = 99 OR M.FechaAct IS NULL THEN 0
        WHEN DATE(M.FechaAct) <> DATE(M.FechaMovimiento) THEN 1
        ELSE 0
    END                    AS Editado
FROM tblReporteMovimientos M
LEFT JOIN tblUsuarios U ON U.IdUsuario = M.IdUsuario
WHERE M.IdArticulo = ?
  AND M.IdSucursal = ?
  AND IFNULL(M.Status, 0) = 0
  AND M.FechaMovimiento <= NOW()
  AND (M.TipoMovimiento IN (0, 99) OR IFNULL(M.Mov, 0) <> 0)${filtroEfecto}
ORDER BY M.FechaMovimiento DESC, M.TipoMovimiento DESC, M.Folio DESC, M.Iteracion DESC
LIMIT ${MAX_RENGLONES}`,
        params: [articulo, sucursal],
    };
}
