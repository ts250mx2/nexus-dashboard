import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const fechaInicio = searchParams.get('fechaInicio');
        const fechaFin = searchParams.get('fechaFin');
        const idTienda = searchParams.get('idTienda');
        const idApertura = searchParams.get('idApertura');

        let dateFilter = 'DATE(A.FechaVenta) >= ? AND DATE(A.FechaVenta) <= ?';
        let params: any[] = [];

        if (fechaInicio && fechaFin) {
            params.push(fechaInicio, fechaFin);
        } else {
            // Default 7 days fallback
            dateFilter = 'DATE(A.FechaVenta) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
        }

        if (idTienda) {
            params.push(idTienda);
        }
        if (idApertura) {
            params.push(idApertura);
        }

        const sql = `
            SELECT 
                T.Sucursal AS Tienda,
                CONCAT(CAST(A.IdComputadora AS CHAR), '-', CAST(A.IdApertura AS CHAR)) AS \`Z\`,
                A.FolioVenta AS \`Folio Cancelacion\`, 
                A.FechaVenta AS FechaCancelacion, 
                B.Cantidad, 
                F.CodigoBarras AS \`Codigo Barras\`, 
                F.Producto AS Descripcion, 
                B.PrecioBase AS \`Precio Venta\`, 
                B.Total,
                D.Usuario AS Cajero,
                COALESCE(E.Usuario, 'No Especificado') AS Supervisor
            FROM tblVentas A
            INNER JOIN tblDetalleVentas B ON A.IdVenta = B.IdVenta AND A.IdSucursal = B.IdSucursal
            INNER JOIN tblSucursales T ON A.IdSucursal = T.IdSucursal
            LEFT JOIN tblUsuarios D ON A.IdUsuarioVenta = D.IdUsuario
            LEFT JOIN tblUsuarios E ON A.IdSupervisorCredito = E.IdUsuario
            INNER JOIN tblArticulos F ON B.IdArticulo = F.IdArticulo
            WHERE A.Status = 2
              AND ${dateFilter}
              ${idTienda ? `AND A.IdSucursal = ?` : ''}
              ${idApertura ? `AND A.IdApertura = ?` : ''}
            ORDER BY A.FechaVenta DESC
        `;

        const results = await query(sql, params);
        return NextResponse.json(results);

    } catch (error: any) {
        console.error('Error fetching cancellation details:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
