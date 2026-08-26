/**
 * Capa única de acceso a EXISTENCIAS de inventario.
 *
 * Fuente primaria (definida por negocio):
 *   tblReporteMovimientos con TipoMovimiento = 99 / Concepto = 'INVENTARIO A FECHA'.
 *   La cantidad vive en la columna `Mov` (NO en `Exi`, que llega nula en esos renglones).
 *
 * Fuente de respaldo: tblCostoInventario.Exi
 *   tblReporteMovimientos es una tabla de trabajo MyISAM que el ERP trunca y repuebla
 *   cada vez que se corre el reporte de movimientos, por lo que en un momento dado solo
 *   contiene las sucursales del último corte. Se validó contra tblCostoInventario y los
 *   valores coinciden en el 100% de los pares artículo-sucursal presentes en ambas, así
 *   que usamos tblCostoInventario como columna vertebral (todas las sucursales + costo
 *   unitario) y dejamos que el tipo 99 la sobrescriba donde exista. La columna `Fuente`
 *   viaja hasta la UI para que se vea de dónde salió cada dato.
 *
 * Todas las consultas son SOLO LECTURA.
 *
 * NOTA DE DESEMPEÑO: cada CTE recibe la lista de sucursales y filtra en el origen.
 * Filtrar únicamente al final multiplicaba por siete el tiempo de respuesta.
 */

/** Tipo de movimiento que representa la existencia a fecha de corte. */
export const TIPO_MOVIMIENTO_EXISTENCIA = 99;

/**
 * Tipos de movimiento que mueven la existencia después de la fecha de corte:
 *   0 = ajuste de inventario, 1 = venta, 2 = recibo de compra, 3 = traspaso
 *   enviado, 4 = traspaso recibido, 6 = consignación abierta.
 * Es decir, TODOS salvo el propio corte (99). Además solo cuentan los renglones
 * con `Status = 0`: `Status = 2` son documentos cancelados que el ERP no aplica.
 *
 * Validado reconstruyendo el corte 99 de MONTERREY (3,747 pares) desde el último
 * ajuste físico de cada par (2026-08-25):
 *   Status = 0, tipos 1-4 y 6 ........ 3,747 / 3,747 (100%)
 *   Status = 0, tipos 1-4 (sin 6) .... 3,740 (99.8%)
 *   sin filtrar Status, tipos 1-4 .... 3,694 (98.6%)
 *   sin filtrar Status, con 6 ........ 2,912 (77.7%)
 * La creencia previa de que la consignación "no descarga inventario" venía de
 * sumarla sin filtrar Status: el 98% de los renglones tipo 6 son cancelados.
 *
 * `Mov` ya viene con signo (las salidas son negativas). La excepción es el tipo 0:
 * ahí `Mov` (= `Exi`) es la existencia CONTADA tras el ajuste y la diferencia
 * aplicada viaja en `Ajuste`; ver exprMovimiento().
 */
export const TIPOS_MOVIMIENTO_INVENTARIO = [0, 1, 2, 3, 4, 6] as const;

/** Ajuste de inventario físico: `Mov` es el conteo, `Ajuste` la diferencia aplicada. */
export const TIPO_MOVIMIENTO_AJUSTE = 0;

/** Consignación abierta. Sí descarga inventario cuando el documento está vigente (Status = 0). */
export const TIPO_MOVIMIENTO_CONSIGNACION = 6;

/**
 * Expresión SQL del efecto neto de un renglón de tblReporteMovimientos sobre la
 * existencia: `Mov` con signo, salvo en los ajustes (tipo 0), donde es `Ajuste`.
 */
export function exprMovimiento(alias = 'M'): string {
    return `CASE WHEN ${alias}.TipoMovimiento = ${TIPO_MOVIMIENTO_AJUSTE} THEN IFNULL(${alias}.Ajuste, 0) ELSE ${alias}.Mov END`;
}

/** Sucursales excluidas por convención en todos los reportes de inventario. */
export const SUCURSAL_EXCLUSION =
    "LOWER(S.Sucursal) NOT LIKE '%fiscal%' AND LOWER(S.Sucursal) NOT LIKE '%prueba%'";

/** Días de historia de venta que se usan por defecto para estimar la demanda. */
export const DIAS_DEMANDA_DEFAULT = 90;
/** Cobertura objetivo por defecto, en días de venta. */
export const DIAS_COBERTURA_DEFAULT = 60;
/** A partir de cuántos días de cobertura se considera sobre-inventario. */
export const DIAS_EXCESO_DEFAULT = 120;
/** Lead time por defecto cuando el artículo no tiene DiasSurtido configurado. */
export const DIAS_SURTIDO_DEFAULT = 15;
/** Colchón de seguridad por defecto, en días, cuando no hay DiasMin configurado. */
export const DIAS_SEGURIDAD_DEFAULT = 7;
/** Ventana hacia atrás para considerar vigente una orden o traspaso sin recibir. */
const DIAS_TRANSITO_VIGENTE = 365;

/** ` AND <col> IN (1,2,3)` o cadena vacía. Los IDs ya vienen validados como enteros. */
function inClause(column: string, sucursales: number[]): string {
    return sucursales.length ? ` AND ${column} IN (${sucursales.join(',')})` : '';
}

/** Artículos a los que se acota el cálculo de existencia. */
export interface ExistenciaOptions {
    /** IDs de artículo ya validados como enteros. Con al menos uno se suma el delta. */
    articulos?: number[];
}

/**
 * CTE `corte`: el último renglón tipo 99 de cada par artículo-sucursal.
 * `FechaActCorte` es la fecha del último movimiento real que el ERP conocía
 * al generar el corte; es lo que la pantalla del ERP muestra como
 * "Última actualización".
 *
 * El origen depende del filtro:
 *   - Catálogo completo: barrer el índice por TipoMovimiento (52k renglones, ~0.4 s)
 *     es lo más barato.
 *   - Con lista de artículos: filtrar `TipoMovimiento = 99` sobre esa lista obliga
 *     a leer TODOS los movimientos de los artículos (2.7 s para 300). Se recorre
 *     entonces desde tblCostoInventario (una fila por par y columna vertebral de
 *     todos los consumidores) y el corte se localiza por el índice
 *     (IdArticulo, IdSucursal, TipoMovimiento): 0.07 s.
 *
 * Con `opts.soloActivos` se descartan desde aquí los artículos dados de baja
 * (~30% de los pares), de modo que los consumidores que después barren los
 * movimientos de cada par no paguen por artículos que no van a mostrar.
 *
 * Columnas: IdArticulo, IdSucursal, ExiCorte, FechaCorte, FechaActCorte
 */
export function cteCorte(
    sucursales: number[],
    articulos: number[] = [],
    opts: { soloActivos?: boolean } = {}
): string {
    const joinActivos = opts.soloActivos
        ? `
        INNER JOIN tblArticulos A
                ON A.IdArticulo = M.IdArticulo
               AND IFNULL(A.Status, 0) = 0`
        : '';

    const origen = articulos.length
        ? `FROM tblCostoInventario CI
        INNER JOIN tblReporteMovimientos M
                ON M.IdArticulo     = CI.IdArticulo
               AND M.IdSucursal     = CI.IdSucursal
               AND M.TipoMovimiento = ${TIPO_MOVIMIENTO_EXISTENCIA}${joinActivos}
        WHERE 1 = 1${inClause('CI.IdSucursal', sucursales)}${inClause('CI.IdArticulo', articulos)}`
        : `FROM tblReporteMovimientos M${joinActivos}
        WHERE M.TipoMovimiento = ${TIPO_MOVIMIENTO_EXISTENCIA}${inClause('M.IdSucursal', sucursales)}`;

    return `
corte AS (
    SELECT IdArticulo, IdSucursal, ExiCorte, FechaCorte, FechaActCorte
    FROM (
        SELECT
            M.IdArticulo,
            M.IdSucursal,
            M.Mov             AS ExiCorte,
            M.FechaMovimiento AS FechaCorte,
            M.FechaAct        AS FechaActCorte,
            ROW_NUMBER() OVER (
                PARTITION BY M.IdArticulo, M.IdSucursal
                ORDER BY M.FechaMovimiento DESC, M.Iteracion DESC, M.Folio DESC
            ) AS rn
        ${origen}
    ) ranked
    WHERE rn = 1
)`;
}

/**
 * CTE `existencia`: una fila por artículo-sucursal con la existencia vigente,
 * el costo unitario y la fuente de la que salió el dato.
 *
 * EXISTENCIA = corte tipo 99 ± los movimientos posteriores a la fecha de ese corte.
 * El ERP refresca el corte cada vez que corre el reporte de movimientos (queda
 * fechado a las 00:00 del día), así que el delta cubre lo que se movió durante el
 * día en curso. Se topa con NOW() porque la base contiene tickets con fecha futura.
 *
 * El delta solo se calcula cuando `opts.articulos` acota la consulta: sin filtro de
 * artículo MySQL tiene que recorrer los 4.1M de renglones de tblReporteMovimientos
 * (no hay índice por FechaMovimiento) y la consulta pasa de 0.15s a 20s. Los
 * reportes de catálogo completo se quedan con el corte, que para planeación es
 * suficiente; la consulta puntual de existencias (`./stock.ts`) sí aplica el delta.
 *
 * Columnas: IdArticulo, IdSucursal, Exi, ExiCorte, MovPosterior, NumMovPosteriores,
 *           FechaCorte, CostoUnitario, Fuente
 */
export function cteExistencia(sucursales: number[], opts: ExistenciaOptions = {}): string {
    const articulos = opts.articulos ?? [];
    const conDelta = articulos.length > 0;

    const ctePosteriores = conDelta ? `
posteriores AS (
    SELECT
        C.IdArticulo,
        C.IdSucursal,
        SUM(${exprMovimiento('M')}) AS MovPosterior,
        COUNT(*)                    AS NumMovimientos
    FROM corte C
    INNER JOIN tblReporteMovimientos M
            ON M.IdArticulo      = C.IdArticulo
           AND M.IdSucursal      = C.IdSucursal
           AND M.TipoMovimiento IN (${TIPOS_MOVIMIENTO_INVENTARIO.join(',')})
           AND M.Status          = 0
           AND M.FechaMovimiento >  C.FechaCorte
           AND M.FechaMovimiento <= NOW()
    WHERE 1 = 1${inClause('M.IdArticulo', articulos)}
    GROUP BY C.IdArticulo, C.IdSucursal
),` : '';

    const joinPosteriores = conDelta
        ? 'LEFT JOIN posteriores P ON P.IdArticulo = CI.IdArticulo AND P.IdSucursal = CI.IdSucursal'
        : '';
    const delta = conDelta ? 'IFNULL(P.MovPosterior, 0)' : '0';
    const numMovs = conDelta ? 'IFNULL(P.NumMovimientos, 0)' : '0';

    return `
${cteCorte(sucursales, articulos)},${ctePosteriores}
existencia AS (
    SELECT
        CI.IdArticulo,
        CI.IdSucursal,
        COALESCE(C.ExiCorte, CI.Exi) + ${delta} AS Exi,
        COALESCE(C.ExiCorte, CI.Exi)            AS ExiCorte,
        ${delta}                                AS MovPosterior,
        ${numMovs}                              AS NumMovPosteriores,
        C.FechaCorte,
        CI.PrecioBase                           AS CostoUnitario,
        CASE WHEN C.ExiCorte IS NULL THEN 'costo' ELSE 'movimientos' END AS Fuente
    FROM tblCostoInventario CI
    LEFT JOIN corte C ON C.IdArticulo = CI.IdArticulo AND C.IdSucursal = CI.IdSucursal
    ${joinPosteriores}
    WHERE 1 = 1${inClause('CI.IdSucursal', sucursales)}${inClause('CI.IdArticulo', articulos)}
)`;
}

/**
 * CTE `demanda`: consumo por artículo-sucursal en la ventana indicada.
 *
 * Cuenta DOS tipos de salida, no solo la venta:
 *   - Venta al público (tblDetalleVentas)
 *   - Traspaso enviado a otra sucursal (tblDetalleTraspasos), que también
 *     descarga inventario de la sucursal origen.
 *
 * Sin los traspasos, las bodegas y la fábrica aparecen con demanda cero y todo
 * su inventario se clasifica como "sin rotación", cuando en realidad surten al
 * resto de la red. El precio promedio se calcula SOLO con ventas reales, porque
 * un traspaso no tiene precio de venta al público.
 *
 * Se acota a CURDATE() porque la base contiene tickets con fecha futura.
 *
 * Columnas: IdArticulo, IdSucursal, UnidadesPeriodo, UnidadesVenta, DemandaDiaria,
 *           VentaPeriodo, PrecioPromedio, UltimaVenta, UltimaSalida
 */
export function cteDemanda(dias: number, sucursales: number[]): string {
    return `
salidas AS (
    SELECT
        DV.IdArticulo,
        DV.IdSucursal,
        DV.Cantidad                                            AS Unidades,
        (DV.Cantidad * DV.PrecioVenta - IFNULL(DV.Descuento, 0)) AS Importe,
        V.FechaVenta                                           AS Fecha,
        1                                                      AS EsVenta
    FROM tblVentas V
    INNER JOIN tblDetalleVentas DV
            ON DV.IdVenta    = V.IdVenta
           AND DV.IdSucursal = V.IdSucursal
    WHERE V.Status = 0
      AND V.FechaVenta >= DATE_SUB(CURDATE(), INTERVAL ${dias} DAY)
      AND V.FechaVenta <  DATE_ADD(CURDATE(), INTERVAL 1 DAY)
      AND DV.Cantidad > 0${inClause('V.IdSucursal', sucursales)}

    UNION ALL

    SELECT
        DT.IdArticulo,
        T.IdSucursal,
        DT.Cantidad AS Unidades,
        0           AS Importe,
        T.FechaTraspaso AS Fecha,
        0           AS EsVenta
    FROM tblTraspasos T
    INNER JOIN tblDetalleTraspasos DT ON DT.IdTraspaso = T.IdTraspaso
    WHERE T.Status = 0
      AND T.FechaTraspaso >= DATE_SUB(CURDATE(), INTERVAL ${dias} DAY)
      AND T.FechaTraspaso <  DATE_ADD(CURDATE(), INTERVAL 1 DAY)
      AND DT.Cantidad > 0${inClause('T.IdSucursal', sucursales)}
),
demanda AS (
    SELECT
        IdArticulo,
        IdSucursal,
        SUM(Unidades)                                          AS UnidadesPeriodo,
        SUM(Unidades) / ${dias}                                AS DemandaDiaria,
        SUM(CASE WHEN EsVenta = 1 THEN Unidades ELSE 0 END)    AS UnidadesVenta,
        SUM(CASE WHEN EsVenta = 1 THEN Importe  ELSE 0 END)    AS VentaPeriodo,
        SUM(CASE WHEN EsVenta = 1 THEN Importe  ELSE 0 END)
            / NULLIF(SUM(CASE WHEN EsVenta = 1 THEN Unidades ELSE 0 END), 0) AS PrecioPromedio,
        MAX(CASE WHEN EsVenta = 1 THEN Fecha END)              AS UltimaVenta,
        MAX(Fecha)                                             AS UltimaSalida
    FROM salidas
    GROUP BY IdArticulo, IdSucursal
)`;
}

/**
 * CTE `parametros`: mínimos, máximos y lead time por artículo-sucursal.
 * Sale de tblConfiguracionResurtido, que está poblada parcialmente
 * (~11,900 de 37,000 pares tienen ExiMinRes > 0), por eso todos los
 * consumidores necesitan un cálculo de respaldo basado en demanda.
 *
 * Columnas: IdArticulo, IdSucursal, ExiMinRes, DiasMin, DiasMax, DiasSurtido
 */
export function cteParametros(sucursales: number[]): string {
    return `
parametros AS (
    SELECT
        IdArticulo,
        IdSucursal,
        MAX(IFNULL(ExiMinRes, 0))   AS ExiMinRes,
        MAX(IFNULL(DiasMin, 0))     AS DiasMin,
        MAX(IFNULL(DiasMax, 0))     AS DiasMax,
        MAX(IFNULL(DiasSurtido, 0)) AS DiasSurtido
    FROM tblConfiguracionResurtido
    WHERE 1 = 1${inClause('IdSucursal', sucursales)}
    GROUP BY IdArticulo, IdSucursal
)`;
}

/**
 * CTE `transito`: mercancía comprometida que todavía no llega a la sucursal.
 * Suma órdenes de compra pendientes de recibir y traspasos enviados sin recepción.
 *
 * El orden de los JOIN importa: hay que arrancar por la cabecera, que es la que
 * trae los filtros selectivos, y de ahí bajar al detalle. Al revés, MySQL recorre
 * las 973 mil líneas de detalle antes de filtrar y la consulta pasa de 3s a 20s.
 *
 * Columnas: IdArticulo, IdSucursal, EnTransito
 */
export function cteTransito(sucursales: number[]): string {
    return `
transito AS (
    SELECT IdArticulo, IdSucursal, SUM(Pendiente) AS EnTransito
    FROM (
        SELECT
            DOC.IdArticulo,
            OC.IdSucursal,
            (DOC.Cantidad - IFNULL(DOC.Rec, 0)) AS Pendiente
        FROM tblOrdenesCompra OC
        INNER JOIN tblDetalleOrdenesCompra DOC ON DOC.IdOrdenCompra = OC.IdOrdenCompra
        WHERE OC.Status = 0
          AND OC.FechaRecibo IS NULL
          AND OC.FechaOrdenCompra >= DATE_SUB(CURDATE(), INTERVAL ${DIAS_TRANSITO_VIGENTE} DAY)
          AND (DOC.Cantidad - IFNULL(DOC.Rec, 0)) > 0${inClause('OC.IdSucursal', sucursales)}

        UNION ALL

        SELECT
            DT.IdArticulo,
            T.IdSucursalDestino AS IdSucursal,
            DT.Cantidad         AS Pendiente
        FROM tblTraspasos T
        INNER JOIN tblDetalleTraspasos DT ON DT.IdTraspaso = T.IdTraspaso
        WHERE T.Status = 0
          AND T.FechaRecibo IS NULL
          AND T.FechaTraspaso >= DATE_SUB(CURDATE(), INTERVAL ${DIAS_TRANSITO_VIGENTE} DAY)
          AND DT.Cantidad > 0${inClause('T.IdSucursalDestino', sucursales)}
    ) pendientes
    GROUP BY IdArticulo, IdSucursal
)`;
}

/**
 * Expresión SQL del MÍNIMO efectivo (punto de reorden) de un artículo-sucursal.
 * Usa el mínimo capturado en el ERP y, cuando no existe, lo deriva de la demanda:
 * lo que se vende mientras llega el resurtido, más un colchón de seguridad.
 */
export function exprMinimo(alias = 'P', demanda = 'D'): string {
    return `CASE
        WHEN IFNULL(${alias}.ExiMinRes, 0) > 0 THEN ${alias}.ExiMinRes
        ELSE IFNULL(${demanda}.DemandaDiaria, 0) * (
                 CASE WHEN IFNULL(${alias}.DiasSurtido, 0) > 0 THEN ${alias}.DiasSurtido ELSE ${DIAS_SURTIDO_DEFAULT} END
               + CASE WHEN IFNULL(${alias}.DiasMin, 0)     > 0 THEN ${alias}.DiasMin     ELSE ${DIAS_SEGURIDAD_DEFAULT} END
             )
    END`;
}

/**
 * Expresión SQL de los DÍAS DE COBERTURA. Devuelve NULL cuando no hay demanda,
 * para poder distinguir "sin rotación" de "cobertura muy alta".
 */
export function exprCobertura(existencia = 'E', demanda = 'D'): string {
    return `CASE
        WHEN IFNULL(${demanda}.DemandaDiaria, 0) <= 0 THEN NULL
        ELSE ${existencia}.Exi / ${demanda}.DemandaDiaria
    END`;
}
