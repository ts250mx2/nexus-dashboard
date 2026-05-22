import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const idSucursal = searchParams.get('idSucursal');
        const sucursal = searchParams.get('sucursal');
        const search = searchParams.get('search');
        const status = searchParams.get('status'); // 'todos' | 'existencias' | 'cero' | 'negativos' | 'alerta'

        let whereClause = "LOWER(B.Sucursal) NOT LIKE '%fiscal%' AND LOWER(B.Sucursal) NOT LIKE '%prueba%'";
        let params: any[] = [];

        if (idSucursal && idSucursal !== 'all') {
            whereClause += ' AND A.IdSucursal = ?';
            params.push(Number(idSucursal));
        } else if (sucursal && sucursal !== 'all') {
            whereClause += ' AND B.Sucursal = ?';
            params.push(sucursal);
        }

        if (search) {
            whereClause += ' AND (D.Producto LIKE ? OR D.Descripcion LIKE ? OR D.Codigo LIKE ? OR D.CodigoBarras LIKE ?)';
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam, searchParam, searchParam);
        }

        if (status === 'existencias') {
            whereClause += ' AND A.Exi > 0';
        } else if (status === 'cero') {
            whereClause += ' AND A.Exi = 0';
        } else if (status === 'negativos') {
            whereClause += ' AND A.Exi < 0';
        } else if (status === 'alerta') {
            whereClause += ' AND A.Exi < IFNULL(C.ExiMinRes, 0) AND IFNULL(C.ExiMinRes, 0) > 0';
        }

        const sql = `
            SELECT 
                A.IdArticulo,
                A.IdSucursal,
                COALESCE(D.Producto, 'Artículo sin nombre') AS Producto,
                COALESCE(D.Descripcion, '') AS Descripcion,
                COALESCE(D.Codigo, D.CodigoBarras, 'S/C') AS Codigo,
                COALESCE(D.Depto, 'Sin Depto') AS Depto, 
                COALESCE(D.Marca, 'Sin Marca') AS Marca,
                A.Exi, 
                A.PrecioBase AS CostoUnitario, 
                (A.Exi * A.PrecioBase) AS CostoTotal,
                IFNULL(C.ExiMinRes, 0) AS ExiMinRes,
                CASE WHEN A.Exi < IFNULL(C.ExiMinRes, 0) AND IFNULL(C.ExiMinRes, 0) > 0 THEN 1 ELSE 0 END AS EnAlerta
            FROM tblCostoInventario A
            INNER JOIN tblSucursales B ON A.IdSucursal = B.IdSucursal
            INNER JOIN tblArticulos D ON A.IdArticulo = D.IdArticulo
            LEFT JOIN tblConfiguracionResurtido C ON A.IdArticulo = C.IdArticulo AND A.IdSucursal = C.IdSucursal
            WHERE ${whereClause}
            ORDER BY CostoTotal DESC
            LIMIT 500
        `;

        const results = await query(sql, params);

        return NextResponse.json({
            success: true,
            data: results
        });

    } catch (error: any) {
        console.error('Error fetching inventory cost details:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
