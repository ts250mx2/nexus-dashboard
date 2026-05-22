import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Devuelve los traspasos con su "Etapa" actual en el pipeline.
 *
 * El mismo registro (OC + Traspaso ligado) avanza por estas etapas:
 *   1. ORDEN_CREADA      → fecha = F.FechaOrdenCompra (proveedor sin entregar)
 *   2. ORDEN_RECIBIDA    → fecha = F.FechaRecibo      (mercancía en almacén central)
 *   3. TRASPASO_ENVIADO  → fecha = A.FechaTraspaso    (en tránsito a sucursal destino)
 *   4. TRASPASO_RECIBIDO → fecha = A.FechaRecibo      (entregado en destino)
 *   X. CANCELADO         → Status <> 0
 *
 * "FechaEtapa" devuelve la fecha relevante a la etapa actual,
 * para que la tarjeta del kanban siempre muestre el último avance del registro.
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const idTienda = searchParams.get('idTienda') || 'all';
        const includeCancelled = searchParams.get('includeCancelled') === '1';

        if (!startDate || !endDate) {
            return NextResponse.json(
                { error: 'Parameters startDate and endDate are required' },
                { status: 400 }
            );
        }

        const start = `${startDate} 00:00:00`;
        const end = `${endDate} 23:59:59`;

        let sql = `
            SELECT
                A.IdTraspaso,
                A.IdSucursal,
                A.IdSucursalDestino,
                A.FechaTraspaso,
                A.FechaRecibo AS FechaReciboTraspaso,
                A.Total,
                A.CantProductos,
                A.Status,
                A.IdUsuarioTraspaso,
                A.IdUsuarioRecibo,
                A.IdUsuarioPago,
                A.IdUsuarioCancelacion,
                B.Sucursal AS SucursalOrigen,
                C.Sucursal AS SucursalDestino,
                D.Usuario AS UsuarioTraspaso,
                E.Usuario AS UsuarioCancelacion,
                F.IdOrdenCompra,
                F.Iteracion,
                F.FechaOrdenCompra,
                F.FechaRecibo AS FechaReciboOC,
                F.IdUsuarioOrdenCompra,
                F.IdUsuarioRecibo AS IdUsuarioReciboOC,
                F.IdProveedor,
                COALESCE(S.Socio, '') AS Proveedor,
                U_OC_Crea.Usuario AS UsuarioOCCrea,
                U_OC_Rec.Usuario  AS UsuarioOCRecibe,
                U_T_Pago.Usuario  AS UsuarioTraspasoEnvio,
                U_T_Rec.Usuario   AS UsuarioTraspasoRecibe,
                CASE
                    WHEN F.IdOrdenCompra > 0 THEN CONCAT(
                        F.IdOrdenCompra,
                        CASE WHEN F.Iteracion > 0 THEN CONCAT('-', F.Iteracion) ELSE '' END
                    )
                    ELSE ''
                END AS OrdenCompraStr,
                CASE
                    WHEN A.Status <> 0 THEN 'CANCELADO'
                    WHEN COALESCE(A.IdUsuarioRecibo, 0) > 0 THEN 'TRASPASO_RECIBIDO'
                    WHEN COALESCE(A.IdUsuarioPago, 0) > 0 THEN 'TRASPASO_ENVIADO'
                    WHEN F.IdOrdenCompra > 0 AND COALESCE(F.IdUsuarioRecibo, 0) > 0 THEN 'ORDEN_RECIBIDA'
                    WHEN F.IdOrdenCompra > 0 THEN 'ORDEN_CREADA'
                    ELSE 'TRASPASO_ENVIADO'
                END AS Etapa,
                CASE
                    WHEN A.Status <> 0 THEN A.FechaTraspaso
                    WHEN COALESCE(A.IdUsuarioRecibo, 0) > 0 THEN A.FechaRecibo
                    WHEN COALESCE(A.IdUsuarioPago, 0) > 0 THEN A.FechaTraspaso
                    WHEN F.IdOrdenCompra > 0 AND COALESCE(F.IdUsuarioRecibo, 0) > 0 THEN F.FechaRecibo
                    WHEN F.IdOrdenCompra > 0 THEN F.FechaOrdenCompra
                    ELSE A.FechaTraspaso
                END AS FechaEtapa
            FROM tblTraspasos A
            INNER JOIN tblSucursales B ON A.IdSucursal = B.IdSucursal
            INNER JOIN tblSucursales C ON A.IdSucursalDestino = C.IdSucursal
            INNER JOIN tblUsuarios D ON A.IdUsuarioTraspaso = D.IdUsuario
            LEFT JOIN tblUsuarios E ON A.IdUsuarioCancelacion = E.IdUsuario
            LEFT JOIN tblOrdenesCompra F ON A.IdTraspaso = F.IdTraspaso
            LEFT JOIN tblSocios S ON F.IdProveedor = S.IdSocio
            LEFT JOIN tblUsuarios U_OC_Crea ON F.IdUsuarioOrdenCompra = U_OC_Crea.IdUsuario
            LEFT JOIN tblUsuarios U_OC_Rec  ON F.IdUsuarioRecibo = U_OC_Rec.IdUsuario
            LEFT JOIN tblUsuarios U_T_Pago  ON A.IdUsuarioPago = U_T_Pago.IdUsuario
            LEFT JOIN tblUsuarios U_T_Rec   ON A.IdUsuarioRecibo = U_T_Rec.IdUsuario
            WHERE A.Status >= 0
              AND A.FechaTraspaso >= ?
              AND A.FechaTraspaso <= ?
        `;

        const params: any[] = [start, end];

        if (!includeCancelled) {
            sql += ' AND A.Status = 0';
        }

        if (idTienda !== 'all') {
            sql += ' AND (A.IdSucursal = ? OR A.IdSucursalDestino = ?)';
            params.push(Number(idTienda), Number(idTienda));
        }

        sql += ' ORDER BY A.IdTraspaso DESC';

        const results = await query(sql, params);
        return NextResponse.json(results);

    } catch (error: any) {
        console.error('Error fetching traspasos kanban:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
