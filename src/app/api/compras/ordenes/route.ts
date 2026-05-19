import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const idTienda = searchParams.get('idTienda');
        const status = searchParams.get('status'); // 'all' | 'pending' | 'received'

        let dateFilter = '1=1';
        let params: any[] = [];

        if (startDate && endDate) {
            dateFilter = 'DATE(A.FechaOrdenCompra) >= ? AND DATE(A.FechaOrdenCompra) <= ?';
            params.push(startDate, endDate);
        }

        let sql = `
            SELECT 
                A.IdOrdenCompra,
                A.IdProveedor,
                A.FechaOrdenCompra AS Fecha,
                A.Total,
                A.CantProductos,
                A.IdSucursal,
                A.IdTraspaso,
                A.Iteracion,
                CONCAT(LPAD(CAST(A.IdOrdenCompra AS CHAR), 5, '0'), '-', CAST(A.Iteracion AS CHAR)) AS Folio,
                COALESCE(S.Socio, CONCAT('Proveedor #', A.IdProveedor)) AS Proveedor,
                COALESCE(Suc.Sucursal, CONCAT('Sucursal #', A.IdSucursal)) AS Tienda,
                COALESCE(U_Ord.Usuario, 'Usuario Desconocido') AS Creador,
                CASE 
                    WHEN A.IdTraspaso > 0 THEN COALESCE(U_Rec_Traspaso.Usuario, 'No Recibido')
                    ELSE COALESCE(U_Rec_Ord.Usuario, 'No Recibido')
                END AS Receptor,
                CASE 
                    WHEN A.IdTraspaso > 0 THEN CASE WHEN COALESCE(T.IdUsuarioRecibo, 0) = 0 THEN 0 ELSE 1 END
                    ELSE CASE WHEN COALESCE(A.IdUsuarioRecibo, 0) = 0 THEN 0 ELSE 1 END
                END AS Recibida,
                CASE 
                    WHEN A.IdTraspaso > 0 THEN T.FechaRecibo
                    ELSE A.FechaRecibo
                END AS FechaRecibido
            FROM tblOrdenesCompra A
            LEFT JOIN tblSocios S ON A.IdProveedor = S.IdSocio
            LEFT JOIN tblSucursales Suc ON A.IdSucursal = Suc.IdSucursal
            LEFT JOIN tblUsuarios U_Ord ON A.IdUsuarioOrdenCompra = U_Ord.IdUsuario
            LEFT JOIN tblTraspasos T ON A.IdTraspaso = T.IdTraspaso
            LEFT JOIN tblUsuarios U_Rec_Ord ON A.IdUsuarioRecibo = U_Rec_Ord.IdUsuario
            LEFT JOIN tblUsuarios U_Rec_Traspaso ON T.IdUsuarioRecibo = U_Rec_Traspaso.IdUsuario
            WHERE ${dateFilter}
        `;

        if (idTienda && idTienda !== 'all') {
            sql += ' AND A.IdSucursal = ?';
            params.push(Number(idTienda));
        }

        if (status === 'pending') {
            sql += ' AND (CASE WHEN A.IdTraspaso > 0 THEN COALESCE(T.IdUsuarioRecibo, 0) ELSE COALESCE(A.IdUsuarioRecibo, 0) END) = 0';
        } else if (status === 'received') {
            sql += ' AND (CASE WHEN A.IdTraspaso > 0 THEN COALESCE(T.IdUsuarioRecibo, 0) ELSE COALESCE(A.IdUsuarioRecibo, 0) END) > 0';
        }

        sql += ' ORDER BY A.FechaOrdenCompra DESC';

        const results = await query(sql, params);
        return NextResponse.json(results);

    } catch (error: any) {
        console.error('Error fetching purchase orders:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
