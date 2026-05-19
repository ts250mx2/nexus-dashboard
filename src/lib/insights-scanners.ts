/**
 * Scanners de hallazgos para insights diarios automáticos (MySQL / schema Nexus).
 *
 * Cada scanner devuelve datos crudos que el agente interpreta para generar
 * un resumen accionable. Todos los SQL son SOLO SELECT (read-only).
 */

export interface ScannerResult {
    area: string;
    label: string;
    data: any[];
    raw_sql: string;
}

export const INSIGHT_SCANNERS: Array<{
    id: string;
    area: 'ventas' | 'sucursales' | 'productos' | 'operacion';
    label: string;
    description: string;
    sql: string;
}> = [
    {
        id: 'ventas_dia_vs_promedio',
        area: 'ventas',
        label: 'Ventas de hoy vs promedio últimos 7 días',
        description: 'Detecta si las ventas de hoy están por debajo/encima del promedio reciente',
        sql: `
            SELECT
                CURDATE() AS Fecha,
                (SELECT IFNULL(SUM(Total),0) FROM tblVentas
                 WHERE DATE(FechaVenta) = CURDATE()) AS VentaHoy,
                (SELECT IFNULL(AVG(VentaDia),0) FROM (
                    SELECT DATE(FechaVenta) AS Dia, SUM(Total) AS VentaDia
                    FROM tblVentas
                    WHERE FechaVenta >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
                      AND FechaVenta < CURDATE()
                    GROUP BY DATE(FechaVenta)
                ) sub) AS Promedio7d
        `
    },
    {
        id: 'ventas_sucursal_top_bottom',
        area: 'sucursales',
        label: 'Ranking de sucursales hoy',
        description: 'Mejor y peor sucursal del día',
        sql: `
            SELECT S.Nombre AS Sucursal,
                   SUM(V.Total) AS VentaHoy,
                   COUNT(DISTINCT V.IdVenta) AS Tickets
            FROM tblVentas V
            INNER JOIN tblSucursales S ON V.IdSucursal = S.IdSucursal
            WHERE DATE(V.FechaVenta) = CURDATE()
            GROUP BY S.Nombre
            ORDER BY VentaHoy DESC
            LIMIT 10
        `
    },
    {
        id: 'ticket_promedio_tendencia',
        area: 'operacion',
        label: 'Tendencia de ticket promedio últimos 7 días',
        description: 'Evolución del ticket promedio',
        sql: `
            SELECT
                DATE(FechaVenta) AS Dia,
                SUM(Total) / NULLIF(COUNT(DISTINCT IdVenta), 0) AS TicketPromedio,
                COUNT(DISTINCT IdVenta) AS Tickets
            FROM tblVentas
            WHERE FechaVenta >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY DATE(FechaVenta)
            ORDER BY Dia DESC
        `
    },
    {
        id: 'ventas_mes_vs_anterior',
        area: 'ventas',
        label: 'Mes actual vs mes anterior (mismo día)',
        description: 'Compara acumulado del mes contra mismo día del mes anterior',
        sql: `
            SELECT
                (SELECT IFNULL(SUM(Total),0) FROM tblVentas
                 WHERE YEAR(FechaVenta) = YEAR(CURDATE())
                   AND MONTH(FechaVenta) = MONTH(CURDATE())
                   AND DATE(FechaVenta) <= CURDATE()) AS VentaMesActual,
                (SELECT IFNULL(SUM(Total),0) FROM tblVentas
                 WHERE YEAR(FechaVenta) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
                   AND MONTH(FechaVenta) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
                   AND DAY(FechaVenta) <= DAY(CURDATE())) AS VentaMesAnterior
        `
    },
    {
        id: 'top_productos_dia',
        area: 'productos',
        label: 'Top 5 productos del día',
        description: 'Productos con mayor ingreso del día',
        sql: `
            SELECT A.Producto,
                   SUM(D.Total) AS Ingreso,
                   SUM(D.Cantidad) AS Unidades
            FROM tblDetalleVentas D
            INNER JOIN tblVentas V ON D.IdVenta = V.IdVenta
            INNER JOIN tblArticulos A ON D.IdArticulo = A.IdArticulo
            WHERE DATE(V.FechaVenta) = CURDATE()
            GROUP BY A.Producto
            ORDER BY Ingreso DESC
            LIMIT 5
        `
    },
    {
        id: 'horas_pico_hoy',
        area: 'operacion',
        label: 'Horas pico de ventas hoy',
        description: 'Horarios de mayor actividad',
        sql: `
            SELECT HOUR(FechaVenta) AS Hora,
                   SUM(Total) AS Ingreso,
                   COUNT(DISTINCT IdVenta) AS Tickets
            FROM tblVentas
            WHERE DATE(FechaVenta) = CURDATE()
            GROUP BY HOUR(FechaVenta)
            ORDER BY Ingreso DESC
            LIMIT 5
        `
    }
];

export function getScannersByPriority(executedIds: string[] = []): typeof INSIGHT_SCANNERS {
    const priorityOrder = ['ventas', 'sucursales', 'productos', 'operacion'];
    return INSIGHT_SCANNERS
        .filter(s => !executedIds.includes(s.id))
        .sort((a, b) => priorityOrder.indexOf(a.area) - priorityOrder.indexOf(b.area));
}
