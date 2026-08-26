/**
 * Consulta de EXISTENCIAS de una sucursal, artículo por artículo. Réplica de la
 * pantalla "Existencia de artículos" del ERP, pero AL MOMENTO:
 *
 *   ExiInicial = corte tipo 99 de tblReporteMovimientos (existencia a las 00:00 del
 *                día en que el ERP corrió su proceso nocturno) o, si después del
 *                corte se capturó un conteo físico, el resultado de ese conteo.
 *   Entradas / Salidas = documentos posteriores al corte leídos EN VIVO de las
 *                tablas origen —las mismas de las que el ERP construye
 *                tblReporteMovimientos— con exactamente sus filtros
 *                (ProtecServices.java, ProcesarInventario):
 *       ventas         −Cantidad         tblVentas.Status = 0, tblDetalleVentas.Defecto <> 1.
 *                                        SIN filtro de cantidad: las líneas negativas son
 *                                        devoluciones en ticket y cuentan como entrada.
 *       recibos        +Rec              Status = 0, IdTraspaso = 0, IdUsuarioRecibo > 0, por FechaRecibo
 *       traspasos      −Cantidad         sucursal origen, Status = 0, por FechaTraspaso
 *       traspasos      +Cantidad         sucursal destino, Status = 0, IdUsuarioRecibo > 0, por FechaRecibo
 *       devoluciones   +Dev              Status = 0, tblDevoluciones.ConDefecto = 0
 *       consignaciones −CantidadSalida   Status = 0, Cerrada = 0 (abiertas)
 *     más las REVERSIONES: documentos anteriores al corte que se cancelaron o
 *     cerraron después (FechaAct > corte). El corte los incluía y el ERP los
 *     descartará en su próxima corrida, así que se deshacen aquí.
 *   ExiFinal = ExiInicial + Entradas − Salidas
 *
 * Por qué no basta tblReporteMovimientos: es una foto que el ERP borra y repuebla
 * en su corrida nocturna (~02:00). Entre corridas no recibe ningún renglón, así que
 * los movimientos del día no existen ahí hasta la madrugada siguiente; y al
 * regenerarse, el corte se mueve al nuevo día y esos movimientos quedan "antes"
 * del corte. Las tablas origen son la fuente de esa foto: leerlas con la misma
 * regla da el mismo resultado, pero al momento.
 *
 * VALIDACIÓN (2026-08-25, MONTERREY, 3,747 pares): existencia del histórico del
 * 22-ago + documentos con esta regla en (22-ago 00:00, 25-ago 00:00] = existencia
 * del 25-ago en 3,747 / 3,747 artículos (ver tests/lib/inventory si existen).
 *
 * NOTA DE DESEMPEÑO: las tablas origen no tienen índice por fecha; el barrido va
 * por el índice de IdSucursal de cada cabecera (~1 s en MONTERREY con un día de
 * documentos). El costo crece con los días transcurridos desde el corte.
 *
 * Todas las consultas son SOLO LECTURA.
 */

import { SUCURSAL_EXCLUSION, cteCorte } from './source';

/**
 * Tope de ejecución en el servidor MySQL. La consulta no se puede cancelar desde
 * el cliente (mysql2 no interrumpe un execute en curso), así que sin tope cada
 * cambio de sucursal abandonado seguiría ocupando una conexión del pool hasta
 * terminar. Normalmente tarda 1-2 s; 30 s solo se alcanza con el servidor saturado.
 */
const MAX_EXECUTION_MS = 30_000;

/** Expresiones admitidas como límite de fecha (evita interpolar texto libre). */
const FECHA_PERMITIDA = /^(NOW\(\)|'\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?')$/;

/**
 * Ventana de documentos. `hasta` acota el futuro (la base trae tickets con fecha
 * futura). `desde` es la cota inferior GLOBAL con la que se podan los barridos;
 * el corte exacto por artículo se aplica después contra `base.Desde`. Por
 * omisión es la fecha del último corte de la sucursal (tblSucursales.FechaCorteInv,
 * que el ERP escribe al terminar ProcesarInventario con la misma FechaConteo del
 * renglón 99). Se puede fijar una fecha literal para validar contra históricos.
 */
export interface VentanaDocumentos {
    desde?: string;
    hasta?: string;
}

export interface ExistenciaRow {
    IdArticulo: number;
    IdSucursal: number;
    Sucursal: string;
    Codigo: string;
    Descripcion: string;
    Producto: string;
    Marca: string;
    Depto: string;
    ExiInicial: number;
    Entradas: number;
    Salidas: number;
    /** Subconjunto de Entradas con fecha de hoy (Fecha >= CURDATE()). */
    EntradasHoy: number;
    /** Subconjunto de Salidas con fecha de hoy. */
    SalidasHoy: number;
    ExiFinal: number;
    Costo: number;
    Total: number;
    Consignacion: number;
    NumMovimientos: number;
    FechaCorte: string | null;
    UltimaActualizacion: string | null;
    /** De dónde salió ExiInicial: corte 99, conteo físico posterior al corte, o tblCostoInventario. */
    Fuente: 'movimientos' | 'conteo' | 'costo';
}

function validarSucursal(sucursal: number): void {
    if (!Number.isInteger(sucursal) || sucursal <= 0) {
        throw new Error('La consulta de existencias requiere una sucursal válida');
    }
}

function validarFecha(expr: string): void {
    if (!FECHA_PERMITIDA.test(expr)) {
        throw new Error(`Límite de fecha no permitido: ${expr}`);
    }
}

/** Cota inferior global: fecha literal validada o el último corte de la sucursal. */
function exprDesde(sucursal: number, desde?: string): string {
    if (desde === undefined) {
        return `(SELECT FechaCorteInv FROM tblSucursales WHERE IdSucursal = ${sucursal})`;
    }
    validarFecha(desde);
    return desde;
}

function exprHasta(hasta?: string): string {
    const expr = hasta ?? 'NOW()';
    validarFecha(expr);
    return expr;
}

/**
 * CTE `base`: una fila por artículo activo con corte, con la existencia de partida
 * y la fecha desde la que cuentan los documentos.
 *
 * Si después del corte hubo un conteo físico vigente (tblFoliosInventarios con
 * Status = 0), la base pasa a ser ese conteo y solo cuentan los documentos
 * posteriores a él, igual que hará el ERP en su siguiente corrida.
 *
 * `base` lleva DISTINCT a propósito: así MySQL la materializa UNA vez y la
 * comparte entre referencias. Como SELECT plano la fusionaría en cada referencia
 * y volvería a calcular el corte (ventana ROW_NUMBER) cada vez.
 *
 * Columnas: IdArticulo, IdSucursal, ExiInicial, Desde, FechaCorte, FechaActCorte,
 *           FechaConteoPosterior
 */
export function cteBaseExistencia(sucursal: number, ventana: VentanaDocumentos = {}): string {
    validarSucursal(sucursal);
    const desde = exprDesde(sucursal, ventana.desde);
    const hasta = exprHasta(ventana.hasta);

    return `
${cteCorte([sucursal], [], { soloActivos: true })},
folio_posterior AS (
    SELECT IdArticulo, ExiCaptura, FechaConteo
    FROM (
        SELECT
            A.IdArticulo,
            A.ExiCaptura,
            B.FechaConteo,
            ROW_NUMBER() OVER (
                PARTITION BY A.IdArticulo
                ORDER BY B.FechaConteo DESC, B.IdFolioInventario DESC
            ) AS rn
        FROM tblFoliosInventarios B
        INNER JOIN tblDetalleFoliosInventarios A
                ON A.IdFolioInventario = B.IdFolioInventario
               AND A.IdSucursal        = B.IdSucursal
        WHERE B.IdSucursal  = ${sucursal}
          AND B.Status      = 0
          AND B.FechaConteo >  ${desde}
          AND B.FechaConteo <= ${hasta}
    ) f
    WHERE rn = 1
),
base AS (
    SELECT DISTINCT
        C.IdArticulo,
        C.IdSucursal,
        COALESCE(F.ExiCaptura, C.ExiCorte)   AS ExiInicial,
        COALESCE(F.FechaConteo, C.FechaCorte) AS Desde,
        C.FechaCorte,
        C.FechaActCorte,
        F.FechaConteo                         AS FechaConteoPosterior
    FROM corte C
    LEFT JOIN folio_posterior F ON F.IdArticulo = C.IdArticulo
)`;
}

/**
 * CTE `documentos`: cada documento de las tablas origen que puede mover la
 * existencia dentro de la ventana global. Una fila por documento-artículo:
 *   Fecha     = cuándo surtió efecto (fecha del documento; en reversiones, FechaAct)
 *   FechaDoc  = fecha del documento
 *   Mov       = movimiento con signo
 *   Reversion = 1 si deshace un documento anterior al corte cancelado/cerrado después
 *
 * Aquí solo se poda con la cota GLOBAL (`desde`/`hasta`); el corte exacto por
 * artículo se aplica una sola vez en `posteriores` contra `base`. Así ninguna
 * rama referencia `base` y el barrido de cada tabla se hace una sola vez.
 *
 * Los signos y filtros replican ProtecServices.java (ProcesarInventario). Las
 * reversiones usan FechaAct como fecha del efecto: es cuando el ERP registró la
 * cancelación o el cierre.
 */
export function cteDocumentosPosteriores(sucursal: number, ventana: VentanaDocumentos = {}): string {
    validarSucursal(sucursal);
    const s = sucursal;
    const desde = exprDesde(sucursal, ventana.desde);
    const hasta = exprHasta(ventana.hasta);

    return `
documentos AS (
    -- Ventas (las líneas con cantidad negativa son devoluciones en ticket: entran)
    SELECT A.IdArticulo, B.FechaVenta AS Fecha, B.FechaVenta AS FechaDoc, -A.Cantidad AS Mov, 0 AS Reversion
    FROM tblVentas B
    INNER JOIN tblDetalleVentas A ON A.IdVenta = B.IdVenta AND A.IdSucursal = B.IdSucursal
    WHERE B.IdSucursal = ${s} AND B.Status = 0 AND A.Defecto <> 1
      AND B.FechaVenta > ${desde} AND B.FechaVenta <= ${hasta}

    UNION ALL
    -- Recibos de compra
    SELECT A.IdArticulo, B.FechaRecibo, B.FechaRecibo, A.Rec, 0
    FROM tblOrdenesCompra B
    INNER JOIN tblDetalleOrdenesCompra A ON A.IdOrdenCompra = B.IdOrdenCompra AND A.Iteracion = B.Iteracion
    WHERE B.IdSucursal = ${s} AND B.Status = 0 AND B.IdTraspaso = 0 AND B.IdUsuarioRecibo > 0
      AND B.FechaRecibo > ${desde} AND B.FechaRecibo <= ${hasta}

    UNION ALL
    -- Traspasos enviados (sucursal origen)
    SELECT A.IdArticulo, B.FechaTraspaso, B.FechaTraspaso, -A.Cantidad, 0
    FROM tblTraspasos B
    INNER JOIN tblDetalleTraspasos A ON A.IdTraspaso = B.IdTraspaso
    WHERE B.IdSucursal = ${s} AND B.Status = 0
      AND B.FechaTraspaso > ${desde} AND B.FechaTraspaso <= ${hasta}

    UNION ALL
    -- Traspasos recibidos (sucursal destino)
    SELECT A.IdArticulo, B.FechaRecibo, B.FechaRecibo, A.Cantidad, 0
    FROM tblTraspasos B
    INNER JOIN tblDetalleTraspasos A ON A.IdTraspaso = B.IdTraspaso
    WHERE B.IdSucursalDestino = ${s} AND B.Status = 0 AND B.IdUsuarioRecibo > 0
      AND B.FechaRecibo > ${desde} AND B.FechaRecibo <= ${hasta}

    UNION ALL
    -- Devoluciones de clientes
    SELECT A.IdArticulo, B.FechaDevolucion, B.FechaDevolucion, A.Dev, 0
    FROM tblDevoluciones B
    INNER JOIN tblDetalleDevoluciones A ON A.IdDevolucion = B.IdDevolucion AND A.IdSucursal = B.IdSucursal
    WHERE B.IdSucursal = ${s} AND B.Status = 0 AND B.ConDefecto = 0
      AND B.FechaDevolucion > ${desde} AND B.FechaDevolucion <= ${hasta}

    UNION ALL
    -- Consignaciones abiertas
    SELECT A.IdArticulo, B.FechaConsignacion, B.FechaConsignacion, -A.CantidadSalida, 0
    FROM tblConsignaciones B
    INNER JOIN tblDetalleConsignaciones A ON A.IdConsignacion = B.IdConsignacion AND A.IdSucursal = B.IdSucursal
    WHERE B.IdSucursal = ${s} AND B.Status = 0 AND B.Cerrada = 0
      AND B.FechaConsignacion > ${desde} AND B.FechaConsignacion <= ${hasta}

    UNION ALL
    -- REVERSIÓN: ventas anteriores al corte canceladas después
    SELECT A.IdArticulo, B.FechaAct, B.FechaVenta, A.Cantidad, 1
    FROM tblVentas B
    INNER JOIN tblDetalleVentas A ON A.IdVenta = B.IdVenta AND A.IdSucursal = B.IdSucursal
    WHERE B.IdSucursal = ${s} AND B.Status <> 0 AND A.Defecto <> 1
      AND B.FechaVenta <= ${hasta} AND B.FechaAct > ${desde} AND B.FechaAct <= ${hasta}

    UNION ALL
    -- REVERSIÓN: recibos anteriores al corte cancelados después
    SELECT A.IdArticulo, B.FechaAct, B.FechaRecibo, -A.Rec, 1
    FROM tblOrdenesCompra B
    INNER JOIN tblDetalleOrdenesCompra A ON A.IdOrdenCompra = B.IdOrdenCompra AND A.Iteracion = B.Iteracion
    WHERE B.IdSucursal = ${s} AND B.Status <> 0 AND B.IdTraspaso = 0 AND B.IdUsuarioRecibo > 0
      AND B.FechaRecibo <= ${hasta} AND B.FechaAct > ${desde} AND B.FechaAct <= ${hasta}

    UNION ALL
    -- REVERSIÓN: traspasos enviados antes del corte cancelados después
    SELECT A.IdArticulo, B.FechaAct, B.FechaTraspaso, A.Cantidad, 1
    FROM tblTraspasos B
    INNER JOIN tblDetalleTraspasos A ON A.IdTraspaso = B.IdTraspaso
    WHERE B.IdSucursal = ${s} AND B.Status <> 0
      AND B.FechaTraspaso <= ${hasta} AND B.FechaAct > ${desde} AND B.FechaAct <= ${hasta}

    UNION ALL
    -- REVERSIÓN: traspasos recibidos antes del corte cancelados después
    SELECT A.IdArticulo, B.FechaAct, B.FechaRecibo, -A.Cantidad, 1
    FROM tblTraspasos B
    INNER JOIN tblDetalleTraspasos A ON A.IdTraspaso = B.IdTraspaso
    WHERE B.IdSucursalDestino = ${s} AND B.Status <> 0 AND B.IdUsuarioRecibo > 0
      AND B.FechaRecibo <= ${hasta} AND B.FechaAct > ${desde} AND B.FechaAct <= ${hasta}

    UNION ALL
    -- REVERSIÓN: devoluciones anteriores al corte canceladas después
    SELECT A.IdArticulo, B.FechaAct, B.FechaDevolucion, -A.Dev, 1
    FROM tblDevoluciones B
    INNER JOIN tblDetalleDevoluciones A ON A.IdDevolucion = B.IdDevolucion AND A.IdSucursal = B.IdSucursal
    WHERE B.IdSucursal = ${s} AND B.Status <> 0 AND B.ConDefecto = 0
      AND B.FechaDevolucion <= ${hasta} AND B.FechaAct > ${desde} AND B.FechaAct <= ${hasta}

    UNION ALL
    -- REVERSIÓN: consignaciones abiertas al corte que se cerraron o cancelaron después
    SELECT A.IdArticulo, B.FechaAct, B.FechaConsignacion, A.CantidadSalida, 1
    FROM tblConsignaciones B
    INNER JOIN tblDetalleConsignaciones A ON A.IdConsignacion = B.IdConsignacion AND A.IdSucursal = B.IdSucursal
    WHERE B.IdSucursal = ${s} AND (B.Cerrada > 0 OR B.Status <> 0)
      AND B.FechaConsignacion <= ${hasta} AND B.FechaAct > ${desde} AND B.FechaAct <= ${hasta}
)`;
}

/**
 * CTE `posteriores`: totales por artículo. Aquí se aplica el corte exacto de cada
 * artículo (`base.Desde`):
 *   - un documento cuenta si surtió efecto después de Desde;
 *   - una reversión cuenta solo si el documento era anterior a Desde (estaba
 *     dentro del corte) y la base sigue siendo el corte: si hubo un conteo físico
 *     posterior, ese conteo ya absorbió cualquier cancelación previa.
 */
export function ctePosteriores(): string {
    return `
posteriores AS (
    SELECT
        D.IdArticulo,
        SUM(CASE WHEN D.Mov > 0 THEN  D.Mov ELSE 0 END)                             AS Entradas,
        SUM(CASE WHEN D.Mov < 0 THEN -D.Mov ELSE 0 END)                             AS Salidas,
        SUM(CASE WHEN D.Fecha >= CURDATE() AND D.Mov > 0 THEN  D.Mov ELSE 0 END)    AS EntradasHoy,
        SUM(CASE WHEN D.Fecha >= CURDATE() AND D.Mov < 0 THEN -D.Mov ELSE 0 END)    AS SalidasHoy,
        COUNT(*)                                                                    AS NumMovimientos,
        MAX(D.Fecha)                                                                AS UltimoMovimiento
    FROM documentos D
    INNER JOIN base X ON X.IdArticulo = D.IdArticulo
    WHERE D.Mov <> 0
      AND D.Fecha > X.Desde
      AND (
            (D.Reversion = 0 AND D.FechaDoc > X.Desde)
         OR (D.Reversion = 1 AND D.FechaDoc <= X.Desde AND X.FechaConteoPosterior IS NULL)
      )
    GROUP BY D.IdArticulo
)`;
}

/**
 * Una fila por artículo activo de la sucursal, con el desglose de existencia al
 * momento. `ventana` permite acotar los documentos (p. ej. `hasta` = medianoche
 * para una foto "al cierre" tomada minutos después de las 00:00).
 */
export function buildExistenciasQuery(sucursal: number, ventana: VentanaDocumentos = {}): string {
    validarSucursal(sucursal);

    const exiInicial = 'COALESCE(X.ExiInicial, CI.Exi, 0)';
    const exiFinal = `${exiInicial} + IFNULL(P.Entradas, 0) - IFNULL(P.Salidas, 0)`;

    return `
WITH
${cteBaseExistencia(sucursal, ventana)},
${cteDocumentosPosteriores(sucursal, ventana)},
${ctePosteriores()}
SELECT /*+ MAX_EXECUTION_TIME(${MAX_EXECUTION_MS}) */
    CI.IdArticulo,
    CI.IdSucursal,
    S.Sucursal,
    COALESCE(A.Codigo, A.CodigoBarras, 'S/C')                              AS Codigo,
    COALESCE(NULLIF(A.Descripcion, ''), A.Producto, 'Artículo sin nombre') AS Descripcion,
    COALESCE(A.Producto, '')                                               AS Producto,
    COALESCE(NULLIF(A.Marca, ''), 'Sin Marca')                             AS Marca,
    COALESCE(NULLIF(A.Depto, ''), 'Sin Depto')                             AS Depto,
    ${exiInicial}                                                          AS ExiInicial,
    IFNULL(P.Entradas, 0)                                                  AS Entradas,
    IFNULL(P.Salidas, 0)                                                   AS Salidas,
    IFNULL(P.EntradasHoy, 0)                                               AS EntradasHoy,
    IFNULL(P.SalidasHoy, 0)                                                AS SalidasHoy,
    ${exiFinal}                                                            AS ExiFinal,
    IFNULL(CI.PrecioBase, 0)                                               AS Costo,
    (${exiFinal}) * IFNULL(CI.PrecioBase, 0)                               AS Total,
    IFNULL(CI.Consignacion, 0)                                             AS Consignacion,
    IFNULL(P.NumMovimientos, 0)                                            AS NumMovimientos,
    X.FechaCorte,
    COALESCE(P.UltimoMovimiento, X.FechaConteoPosterior, X.FechaActCorte)  AS UltimaActualizacion,
    CASE
        WHEN X.IdArticulo IS NULL              THEN 'costo'
        WHEN X.FechaConteoPosterior IS NOT NULL THEN 'conteo'
        ELSE 'movimientos'
    END                                                                    AS Fuente
FROM tblCostoInventario CI
INNER JOIN tblArticulos  A ON A.IdArticulo = CI.IdArticulo
INNER JOIN tblSucursales S ON S.IdSucursal = CI.IdSucursal
LEFT JOIN base        X ON X.IdArticulo = CI.IdArticulo AND X.IdSucursal = CI.IdSucursal
LEFT JOIN posteriores P ON P.IdArticulo = CI.IdArticulo
WHERE ${SUCURSAL_EXCLUSION}
  AND IFNULL(A.Status, 0) = 0
  AND CI.IdSucursal = ${sucursal}
ORDER BY A.Descripcion, A.Codigo`;
}
