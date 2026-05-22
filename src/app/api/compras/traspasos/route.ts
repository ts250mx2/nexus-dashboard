import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const idTienda = searchParams.get('idTienda') || 'all';
        const status = searchParams.get('status') || 'all'; // all | pending | received | paid | cancelled

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
                A.FechaRecibo,
                A.Total,
                A.CantProductos,
                A.Status,
                A.IdUsuarioTraspaso,
                A.IdUsuarioRecibo,
                A.IdUsuarioPago,
                A.IdUsuarioCancelacion,
                B.Sucursal AS SucursalOrigen,
                C.Sucursal AS SucursalDestino,
                CASE
                    WHEN A.IdUsuarioPago > 0 AND A.Status = 0 THEN 'PAGADO'
                    WHEN A.IdUsuarioRecibo > 0 AND A.Status = 0 THEN 'RECIBIDA'
                    WHEN A.Status = 0 THEN 'PENDIENTE'
                    ELSE CONCAT('CANCELADO (', COALESCE(E.Usuario, 'SIN USUARIO'), ')')
                END AS StatusDescripcion,
                D.Usuario AS UsuarioTraspaso,
                E.Usuario AS UsuarioCancelacion,
                CASE
                    WHEN F.IdOrdenCompra > 0 THEN CONCAT(
                        F.IdOrdenCompra,
                        CASE WHEN F.Iteracion > 0 THEN CONCAT('-', F.Iteracion) ELSE '' END
                    )
                    ELSE ''
                END AS OrdenCompraStr,
                F.IdOrdenCompra,
                F.Iteracion,
                F.IdProveedor,
                COALESCE(S.Socio, '') AS Proveedor
            FROM tblTraspasos A
            INNER JOIN tblSucursales B ON A.IdSucursal = B.IdSucursal
            INNER JOIN tblSucursales C ON A.IdSucursalDestino = C.IdSucursal
            INNER JOIN tblUsuarios D ON A.IdUsuarioTraspaso = D.IdUsuario
            LEFT JOIN tblUsuarios E ON A.IdUsuarioCancelacion = E.IdUsuario
            LEFT JOIN tblOrdenesCompra F ON A.IdTraspaso = F.IdTraspaso
            LEFT JOIN tblSocios S ON F.IdProveedor = S.IdSocio
            WHERE A.Status >= 0
              AND A.FechaTraspaso >= ?
              AND A.FechaTraspaso <= ?
        `;

        const params: any[] = [start, end];

        if (idTienda !== 'all') {
            sql += ' AND (A.IdSucursal = ? OR A.IdSucursalDestino = ?)';
            params.push(Number(idTienda), Number(idTienda));
        }

        if (status === 'pending') {
            sql += ' AND A.Status = 0 AND COALESCE(A.IdUsuarioRecibo, 0) = 0 AND COALESCE(A.IdUsuarioPago, 0) = 0';
        } else if (status === 'received') {
            sql += ' AND A.Status = 0 AND COALESCE(A.IdUsuarioRecibo, 0) > 0 AND COALESCE(A.IdUsuarioPago, 0) = 0';
        } else if (status === 'paid') {
            sql += ' AND A.Status = 0 AND COALESCE(A.IdUsuarioPago, 0) > 0';
        } else if (status === 'cancelled') {
            sql += ' AND A.Status <> 0';
        }

        sql += ' ORDER BY A.IdTraspaso DESC';

        const results = await query(sql, params);
        return NextResponse.json(results);

    } catch (error: any) {
        console.error('Error fetching traspasos:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
