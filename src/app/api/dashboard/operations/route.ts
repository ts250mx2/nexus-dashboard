import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

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
                SELECT IdSucursal, COUNT(DISTINCT IdApertura) as TotalAperturas
                FROM tblAperturasCierres
                WHERE DATE(FechaApertura) = ?
                GROUP BY IdSucursal
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
                   D.Usuario AS Supervisor
            FROM tblAperturasCierres A 
            INNER JOIN tblUsuarios C ON A.IdSupervisor = C.IdUsuario
            LEFT JOIN tblUsuarios D ON A.IdSupervisorCierre = D.IdUsuario
            LEFT JOIN (
                SELECT IdApertura, IdSucursal, SUM(Total) AS Total, COUNT(*) AS Operaciones
                FROM tblVentas
                WHERE Status = 0
                GROUP BY IdApertura, IdSucursal
            ) V ON A.IdApertura = V.IdApertura AND A.IdSucursal = V.IdSucursal
            WHERE DATE(A.FechaApertura) = ?
            ORDER BY A.IdSucursal
        `;

        // 3. Cancellations (Grouped by Opening to align them)
        const cancellationsSql = `
            SELECT A.IdSucursal, A.IdApertura, A.IdComputadora, COUNT(*) as Cantidad, COALESCE(SUM(B.PrecioVenta*B.Cantidad), 0) as Monto
            FROM tblVentas A
            INNER JOIN tblDetalleVentas B ON A.IdVenta = B.IdVenta AND A.IdSucursal = B.IdSucursal
            WHERE A.Status = 2 AND DATE(A.FechaVenta) = ?
            GROUP BY A.IdSucursal, A.IdApertura, A.IdComputadora
        `;

        const [stores, openingDetails, cancellations] = await Promise.all([
            query(storesSql, [fecha, fecha]),
            query(openingsSql, [fecha]),
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
                    c.IdApertura === op.IdApertura &&
                    c.IdComputadora === op.Caja
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
