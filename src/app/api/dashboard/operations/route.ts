import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Aperturas que cuentan para el día: las abiertas ese día y las de días anteriores
 * que seguían abiertas al empezar el día (sin cierre, o cerradas ese día o
 * después). Hay sucursales que abren caja en la tarde y venden con ella al día
 * siguiente (QUERETARO, UNIVERSIDAD, TORREON): sin esto ni aparecían. FechaCierre
 * es texto: '2000-01-01' marca una caja sin cerrar y las fechas reales
 * 'YYYY-MM-DD HH:MM:SS' se comparan bien como texto contra 'YYYY-MM-DD'.
 * Usa tres parámetros: la fecha, tres veces.
 */
const APERTURA_DEL_DIA = `(
    DATE(A.FechaApertura) = ?
    OR (DATE(A.FechaApertura) < ?
        AND (A.FechaCierre IS NULL OR A.FechaCierre = '2000-01-01' OR A.FechaCierre >= ?))
)`;

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const fecha = searchParams.get('fecha'); // Expects YYYY-MM-DD

        if (!fecha) {
            return NextResponse.json({ error: 'Missing date parameter' }, { status: 400 });
        }

        // 1. Stores with metrics (KPIs)
        const storesSql = `
            SELECT B.IdSucursal, B.Sucursal, 
                   COALESCE(A.TotalAperturas, 0) as aperturas,
                   COALESCE(V.TotalVentas, 0) as ventas,
                   COALESCE(V.Operaciones, 0) as ventasCount,
                   CASE WHEN COALESCE(V.Operaciones, 0) > 0 THEN COALESCE(V.TotalVentas, 0) / V.Operaciones ELSE 0 END as ticketPromedio
            FROM tblSucursales B
            INNER JOIN (
                SELECT A.IdSucursal, COUNT(DISTINCT A.IdApertura) as TotalAperturas
                FROM tblAperturasCierres A
                WHERE ${APERTURA_DEL_DIA}
                GROUP BY A.IdSucursal
            ) A ON B.IdSucursal = A.IdSucursal
            LEFT JOIN (
                SELECT IdSucursal, SUM(Total) as TotalVentas, COUNT(*) as Operaciones
                FROM tblVentas
                WHERE DATE(FechaVenta) = ? AND Status = 0
                GROUP BY IdSucursal
            ) V ON B.IdSucursal = V.IdSucursal
            WHERE B.EsVenta = 1 AND B.Status = 0
            ORDER BY B.Sucursal
        `;

        // 2. Detailed Openings & Closures (Includes Supervisor and Closing Time)
        const openingsSql = `
            SELECT A.IdSucursal, A.IdApertura, 
                   CONCAT(CAST(A.IdApertura AS CHAR)) AS \`Z\`,
                   DATE_FORMAT(A.FechaApertura, '%H:%i') as HoraApertura, 
                   A.FechaApertura AS RawFechaApertura, 
                   CASE WHEN A.FechaCierre = '2000-01-01' THEN NULL ELSE A.FechaCierre END AS RawFechaCierre,
                   CASE WHEN A.FechaCierre = '2000-01-01' THEN NULL ELSE DATE_FORMAT(A.FechaCierre, '%H:%i') END as HoraCierre, 
                   '1' AS Caja, 
                   C.Usuario AS Cajero, 
                   COALESCE(V.Total, 0) AS Total, 
                   COALESCE(V.Operaciones, 0) AS Operaciones, 
                   D.Usuario AS Supervisor,
                   -- Abierta un día anterior al elegido: la pantalla la marca en alerta.
                   CASE WHEN DATE(A.FechaApertura) < ? THEN 1 ELSE 0 END AS DiaAnterior,
                   CASE WHEN A.FechaCierre IS NULL OR A.FechaCierre = '2000-01-01' THEN 1 ELSE 0 END AS SigueAbierta
            FROM tblAperturasCierres A 
            INNER JOIN tblUsuarios C ON A.IdSupervisor = C.IdUsuario
            LEFT JOIN tblUsuarios D ON A.IdSupervisorCierre = D.IdUsuario
            LEFT JOIN (
                SELECT IdApertura, IdSucursal, SUM(Total) AS Total, COUNT(*) AS Operaciones
                FROM tblVentas
                WHERE Status = 0
                GROUP BY IdApertura, IdSucursal
            ) V ON A.IdApertura = V.IdApertura AND A.IdSucursal = V.IdSucursal
            WHERE ${APERTURA_DEL_DIA}
            ORDER BY A.IdSucursal, A.FechaApertura
        `;

        // 3. Cancellations (Grouped by Opening to align them). Por apertura, no por
        // computadora: la caja de cada apertura es siempre '1' y las cancelaciones
        // traen IdComputadora = 0, así que emparejar por computadora no encontraba nada.
        // Cantidad = tickets cancelados (el JOIN con el detalle repite el ticket por renglón).
        const cancellationsSql = `
            SELECT A.IdSucursal, A.IdApertura, COUNT(DISTINCT A.IdVenta) as Cantidad, COALESCE(SUM(B.PrecioVenta*B.Cantidad), 0) as Monto
            FROM tblVentas A
            INNER JOIN tblDetalleVentas B ON A.IdVenta = B.IdVenta AND A.IdSucursal = B.IdSucursal
            WHERE A.Status = 2 AND DATE(A.FechaVenta) = ?
            GROUP BY A.IdSucursal, A.IdApertura
        `;

        const [stores, openingDetails, cancellations] = await Promise.all([
            query(storesSql, [fecha, fecha, fecha, fecha]),
            query(openingsSql, [fecha, fecha, fecha, fecha]),
            query(cancellationsSql, [fecha])
        ]);

        const storesList = stores as any[];
        const openingDetailsList = openingDetails as any[];
        const cancellationsList = cancellations as any[];

        const result = storesList.map(store => {
            const storeOpenings = openingDetailsList.filter(o => o.IdSucursal === store.IdSucursal);

            // Map openings with their respective cancellations
            const detailedOpenings = storeOpenings.map(op => {
                const cancel = cancellationsList.find(c =>
                    c.IdSucursal === store.IdSucursal &&
                    c.IdApertura === op.IdApertura
                );

                return {
                    ...op,
                    cancelaciones: cancel?.Cantidad || 0,
                    cancelacionesMonto: cancel?.Monto || 0
                };
            });

            return {
                id: store.IdSucursal,
                name: store.Sucursal,
                aperturas: store.aperturas,
                ventas: store.ventas,
                ventasCount: store.ventasCount,
                ticketPromedio: store.ticketPromedio,
                aperturasDiaAnterior: detailedOpenings.filter(op => Number(op.DiaAnterior) === 1).length,
                details: {
                    openings: detailedOpenings,
                    cancelaciones: detailedOpenings.reduce((acc, curr) => acc + curr.cancelaciones, 0),
                    cancelacionesMonto: detailedOpenings.reduce((acc, curr) => acc + curr.cancelacionesMonto, 0),
                    cortes: detailedOpenings.filter(op => op.HoraCierre && op.Supervisor).length
                }
            };
        });

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('Error fetching operations data:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
