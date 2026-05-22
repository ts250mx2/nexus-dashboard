import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Artículos abastecidos en un periodo, opcionalmente filtrados por sucursal destino.
 * Une las líneas de tblDetalleOrdenesCompra (compras a proveedor, IdTraspaso = 0) con
 * tblDetalleTraspasos para mostrar cuánto entró de cada artículo por compras y traspasos.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const sucursalId = searchParams.get('sucursalId') || 'all';

        if (!startDate || !endDate) {
            return NextResponse.json({ error: 'Missing date parameters' }, { status: 400 });
        }

        const dateStart = `${startDate} 00:00:00`;
        const dateEnd = `${endDate} 23:59:59`;

        const sucursalFilterCompras = sucursalId !== 'all' && sucursalId !== ''
            ? ' AND OC.IdSucursal = ?'
            : '';
        const sucursalFilterTraspasos = sucursalId !== 'all' && sucursalId !== ''
            ? ' AND T.IdSucursalDestino = ?'
            : '';

        const params: any[] = [dateStart, dateEnd];
        if (sucursalFilterCompras) params.push(Number(sucursalId));
        params.push(dateStart, dateEnd);
        if (sucursalFilterTraspasos) params.push(Number(sucursalId));

        const sql = `
            SELECT
                A.IdArticulo,
                COALESCE(A.Codigo, '') AS Codigo,
                COALESCE(A.Descripcion, A.Producto, CONCAT('Articulo #', A.IdArticulo)) AS Articulo,
                SUM(X.Cantidad) AS Cantidad,
                SUM(X.Total) AS Total,
                SUM(X.CompraCant) AS CantCompras,
                SUM(X.CompraTotal) AS TotalCompras,
                SUM(X.TraspasoCant) AS CantTraspasos,
                SUM(X.TraspasoTotal) AS TotalTraspasos,
                SUM(X.Recibido) AS Recibidos,
                SUM(X.Pendiente) AS Pendientes
            FROM (
                SELECT
                    DOC.IdArticulo,
                    DOC.Cantidad,
                    DOC.Cantidad * DOC.Costo AS Total,
                    DOC.Cantidad AS CompraCant,
                    DOC.Cantidad * DOC.Costo AS CompraTotal,
                    0 AS TraspasoCant,
                    0 AS TraspasoTotal,
                    CASE WHEN COALESCE(OC.IdUsuarioRecibo, 0) > 0 THEN 1 ELSE 0 END AS Recibido,
                    CASE WHEN COALESCE(OC.IdUsuarioRecibo, 0) = 0 THEN 1 ELSE 0 END AS Pendiente
                FROM tblDetalleOrdenesCompra DOC
                INNER JOIN tblOrdenesCompra OC
                    ON DOC.IdOrdenCompra = OC.IdOrdenCompra
                   AND DOC.Iteracion = OC.Iteracion
                WHERE COALESCE(OC.IdTraspaso, 0) = 0
                  AND OC.FechaOrdenCompra BETWEEN ? AND ?
                  ${sucursalFilterCompras}

                UNION ALL

                SELECT
                    DT.IdArticulo,
                    DT.Cantidad,
                    DT.Cantidad * DT.Costo AS Total,
                    0 AS CompraCant,
                    0 AS CompraTotal,
                    DT.Cantidad AS TraspasoCant,
                    DT.Cantidad * DT.Costo AS TraspasoTotal,
                    CASE WHEN COALESCE(T.IdUsuarioRecibo, 0) > 0 AND T.Status = 0 THEN 1 ELSE 0 END AS Recibido,
                    CASE WHEN COALESCE(T.IdUsuarioRecibo, 0) = 0 AND T.Status = 0 THEN 1 ELSE 0 END AS Pendiente
                FROM tblDetalleTraspasos DT
                INNER JOIN tblTraspasos T ON DT.IdTraspaso = T.IdTraspaso
                WHERE T.FechaTraspaso BETWEEN ? AND ?
                  AND T.Status = 0
                  ${sucursalFilterTraspasos}
            ) X
            INNER JOIN tblArticulos A ON X.IdArticulo = A.IdArticulo
            GROUP BY A.IdArticulo, A.Codigo, A.Descripcion, A.Producto
            ORDER BY Total DESC
        `;

        const rows = await query(sql, params);
        return NextResponse.json({ success: true, data: rows });
    } catch (error: any) {
        console.error('Error in API /compras/global/articulos:', error);
        return NextResponse.json({ error: 'Database error fetching compras global articulos' }, { status: 500 });
    }
}
