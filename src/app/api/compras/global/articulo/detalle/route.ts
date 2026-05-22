import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Detalle por artículo: combina todas las compras (a proveedor) y traspasos
 * (entre sucursales) que recibieron este artículo en el periodo dado.
 * Ambas líneas vienen en una misma lista marcadas con `Tipo` = 'COMPRA' | 'TRASPASO'
 * para que el front pueda renderizarlas en una sola tabla o agruparlas si lo prefiere.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const idArticulo = searchParams.get('idArticulo');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const sucursalId = searchParams.get('sucursalId') || 'all';

        if (!idArticulo || !startDate || !endDate) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const dateStart = `${startDate} 00:00:00`;
        const dateEnd = `${endDate} 23:59:59`;

        const sucursalFilterCompra = sucursalId !== 'all' && sucursalId !== ''
            ? ' AND OC.IdSucursal = ?'
            : '';
        const sucursalFilterTraspaso = sucursalId !== 'all' && sucursalId !== ''
            ? ' AND T.IdSucursalDestino = ?'
            : '';

        // COMPRAS
        const comprasSql = `
            SELECT
                'COMPRA' AS Tipo,
                OC.IdOrdenCompra AS Id,
                OC.Iteracion,
                CONCAT(LPAD(CAST(OC.IdOrdenCompra AS CHAR), 5, '0'), '-', CAST(OC.Iteracion AS CHAR)) AS Folio,
                OC.FechaOrdenCompra AS Fecha,
                CASE WHEN OC.FechaRecibo = '2000-01-01' THEN NULL ELSE OC.FechaRecibo END AS FechaRecibo,
                Suc.Sucursal AS SucursalDestino,
                NULL AS SucursalOrigen,
                COALESCE(S.Socio, CONCAT('Proveedor #', OC.IdProveedor)) AS Origen,
                DOC.Cantidad,
                DOC.Costo,
                DOC.Cantidad * DOC.Costo AS Total,
                CASE WHEN COALESCE(OC.IdUsuarioRecibo, 0) > 0 THEN 'Recibida' ELSE 'Pendiente' END AS Estatus,
                COALESCE(U.Usuario, 'Desconocido') AS Creador,
                COALESCE(UR.Usuario, '') AS Receptor
            FROM tblDetalleOrdenesCompra DOC
            INNER JOIN tblOrdenesCompra OC
                ON DOC.IdOrdenCompra = OC.IdOrdenCompra
               AND DOC.Iteracion = OC.Iteracion
            LEFT JOIN tblSucursales Suc ON OC.IdSucursal = Suc.IdSucursal
            LEFT JOIN tblSocios S ON OC.IdProveedor = S.IdSocio
            LEFT JOIN tblUsuarios U ON OC.IdUsuarioOrdenCompra = U.IdUsuario
            LEFT JOIN tblUsuarios UR ON OC.IdUsuarioRecibo = UR.IdUsuario
            WHERE DOC.IdArticulo = ?
              AND COALESCE(OC.IdTraspaso, 0) = 0
              AND OC.FechaOrdenCompra BETWEEN ? AND ?
              ${sucursalFilterCompra}
            ORDER BY OC.FechaOrdenCompra DESC
        `;

        const comprasParams: any[] = [Number(idArticulo), dateStart, dateEnd];
        if (sucursalFilterCompra) comprasParams.push(Number(sucursalId));

        // TRASPASOS
        const traspasosSql = `
            SELECT
                'TRASPASO' AS Tipo,
                T.IdTraspaso AS Id,
                0 AS Iteracion,
                CAST(T.IdTraspaso AS CHAR) AS Folio,
                T.FechaTraspaso AS Fecha,
                CASE WHEN T.FechaRecibo = '2000-01-01' THEN NULL ELSE T.FechaRecibo END AS FechaRecibo,
                SD.Sucursal AS SucursalDestino,
                SO.Sucursal AS SucursalOrigen,
                SO.Sucursal AS Origen,
                DT.Cantidad,
                DT.Costo,
                DT.Cantidad * DT.Costo AS Total,
                CASE
                    WHEN T.Status <> 0 THEN 'Cancelado'
                    WHEN COALESCE(T.IdUsuarioRecibo, 0) > 0 THEN 'Recibido'
                    ELSE 'Pendiente'
                END AS Estatus,
                COALESCE(U.Usuario, 'Desconocido') AS Creador,
                COALESCE(UR.Usuario, '') AS Receptor
            FROM tblDetalleTraspasos DT
            INNER JOIN tblTraspasos T ON DT.IdTraspaso = T.IdTraspaso
            LEFT JOIN tblSucursales SD ON T.IdSucursalDestino = SD.IdSucursal
            LEFT JOIN tblSucursales SO ON T.IdSucursal = SO.IdSucursal
            LEFT JOIN tblUsuarios U ON T.IdUsuarioTraspaso = U.IdUsuario
            LEFT JOIN tblUsuarios UR ON T.IdUsuarioRecibo = UR.IdUsuario
            WHERE DT.IdArticulo = ?
              AND T.FechaTraspaso BETWEEN ? AND ?
              ${sucursalFilterTraspaso}
            ORDER BY T.FechaTraspaso DESC
        `;

        const traspasosParams: any[] = [Number(idArticulo), dateStart, dateEnd];
        if (sucursalFilterTraspaso) traspasosParams.push(Number(sucursalId));

        const [compras, traspasos] = await Promise.all([
            query(comprasSql, comprasParams) as Promise<any[]>,
            query(traspasosSql, traspasosParams) as Promise<any[]>
        ]);

        return NextResponse.json({
            success: true,
            compras,
            traspasos
        });
    } catch (error: any) {
        console.error('Error in API /compras/global/articulo/detalle:', error);
        return NextResponse.json({ error: 'Database error fetching articulo detalle' }, { status: 500 });
    }
}
