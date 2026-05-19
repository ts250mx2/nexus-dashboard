import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const fechaInicio = searchParams.get('fechaInicio');
        const fechaFin = searchParams.get('fechaFin');
        const idTienda = searchParams.get('idTienda'); // optional

        if (!fechaInicio || !fechaFin) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        const params: any[] = [fechaInicio, fechaFin];
        if (idTienda) {
            params.push(idTienda);
        }

        const sql = `
            SELECT 
                A.IdSucursal, 
                T.Sucursal AS Tienda, 
                A.IdApertura, 
                '1' AS IdComputadora, 
                CONCAT(CAST(A.IdApertura AS CHAR)) AS \`Z\`, 
                '1' AS Caja, 
                A.FechaApertura AS \`Fecha Apertura\`, 
                C.Usuario AS Cajero,
                COUNT(CASE WHEN V.Status = 0 THEN V.IdVenta ELSE NULL END) AS Tickets, 
                COALESCE(SUM(CASE WHEN V.Status = 0 THEN V.Total ELSE 0 END), 0) AS \`Total Venta\`, 
                CASE WHEN A.FechaCierre = '2000-01-01' THEN NULL ELSE A.FechaCierre END AS FechaCierre
            FROM tblAperturasCierres A
            INNER JOIN tblSucursales T ON A.IdSucursal = T.IdSucursal
            INNER JOIN tblUsuarios C ON A.IdSupervisor = C.IdUsuario
            LEFT JOIN tblVentas V ON A.IdApertura = V.IdApertura AND A.IdSucursal = V.IdSucursal
            WHERE DATE(A.FechaApertura) >= ? AND DATE(A.FechaApertura) <= ?
              ${idTienda ? `AND A.IdSucursal = ?` : ''}
            GROUP BY A.IdSucursal, T.Sucursal, A.IdApertura, A.FechaApertura, C.Usuario, A.FechaCierre
            ORDER BY A.FechaApertura
        `;

        const results = await query(sql, params);
        return NextResponse.json(results);

    } catch (error: any) {
        console.error('Error fetching opening details:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
