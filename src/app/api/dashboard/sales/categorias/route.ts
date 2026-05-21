import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const fechaInicio = searchParams.get('fechaInicio');
        const fechaFin = searchParams.get('fechaFin');
        const idTienda = searchParams.get('idTienda');
        const level = searchParams.get('level') || 'categoria'; // 'categoria', 'producto', 'articulo'
        const idCategoria = searchParams.get('idCategoria');
        const productoName = searchParams.get('productoName');

        if (!fechaInicio || !fechaFin) {
            return NextResponse.json({ error: 'Missing date parameters' }, { status: 400 });
        }

        const params: any[] = [fechaInicio, fechaFin];
        let storeFilter = '';
        if (idTienda && idTienda !== 'all') {
            storeFilter = ' AND V.IdSucursal = ?';
        }

        let sql = '';
        
        if (level === 'categoria') {
            sql = `
                SELECT 
                    A.IdCategoria,
                    IFNULL(C.Categoria, '(Sin categoría)') as name,
                    SUM(DV.Cantidad * DV.PrecioVenta - IFNULL(DV.Descuento, 0)) as value
                FROM tblDetalleVentas DV
                INNER JOIN tblVentas V ON DV.IdVenta = V.IdVenta AND DV.IdSucursal = V.IdSucursal
                INNER JOIN tblArticulos A ON DV.IdArticulo = A.IdArticulo
                LEFT JOIN tblCategorias C ON A.IdCategoria = C.IdCategoria
                WHERE V.Status = 0 
                  AND DATE(V.FechaVenta) >= ? 
                  AND DATE(V.FechaVenta) <= ?
            `;
            if (idTienda && idTienda !== 'all') {
                sql += storeFilter;
                params.push(parseInt(idTienda, 10));
            }
            sql += `
                GROUP BY A.IdCategoria, C.Categoria
                HAVING value > 0
                ORDER BY value DESC
            `;
        } else if (level === 'producto') {
            sql = `
                SELECT 
                    A.Producto as name,
                    SUM(DV.Cantidad * DV.PrecioVenta - IFNULL(DV.Descuento, 0)) as value
                FROM tblDetalleVentas DV
                INNER JOIN tblVentas V ON DV.IdVenta = V.IdVenta AND DV.IdSucursal = V.IdSucursal
                INNER JOIN tblArticulos A ON DV.IdArticulo = A.IdArticulo
                WHERE V.Status = 0 
                  AND DATE(V.FechaVenta) >= ? 
                  AND DATE(V.FechaVenta) <= ?
            `;
            if (idTienda && idTienda !== 'all') {
                sql += storeFilter;
                params.push(parseInt(idTienda, 10));
            }
            
            if (!idCategoria || idCategoria === 'null' || idCategoria === 'undefined') {
                sql += ` AND A.IdCategoria IS NULL`;
            } else {
                sql += ` AND A.IdCategoria = ?`;
                params.push(parseInt(idCategoria, 10));
            }

            sql += `
                GROUP BY A.Producto
                HAVING value > 0
                ORDER BY value DESC
            `;
        } else if (level === 'articulo') {
            sql = `
                SELECT 
                    CONCAT(IFNULL(A.Descripcion, A.Producto), ' (', IFNULL(A.Codigo, A.IdArticulo), ')') as name,
                    SUM(DV.Cantidad * DV.PrecioVenta - IFNULL(DV.Descuento, 0)) as value
                FROM tblDetalleVentas DV
                INNER JOIN tblVentas V ON DV.IdVenta = V.IdVenta AND DV.IdSucursal = V.IdSucursal
                INNER JOIN tblArticulos A ON DV.IdArticulo = A.IdArticulo
                WHERE V.Status = 0 
                  AND DATE(V.FechaVenta) >= ? 
                  AND DATE(V.FechaVenta) <= ?
            `;
            if (idTienda && idTienda !== 'all') {
                sql += storeFilter;
                params.push(parseInt(idTienda, 10));
            }

            if (!idCategoria || idCategoria === 'null' || idCategoria === 'undefined') {
                sql += ` AND A.IdCategoria IS NULL`;
            } else {
                sql += ` AND A.IdCategoria = ?`;
                params.push(parseInt(idCategoria, 10));
            }

            sql += ` AND A.Producto = ?`;
            params.push(productoName || '');

            sql += `
                GROUP BY A.IdArticulo, A.Codigo, A.Descripcion, A.Producto
                HAVING value > 0
                ORDER BY value DESC
            `;
        }

        const results = await query(sql, params);

        // Fetch stores list for the sidebar filter that had active sales in the selected period.
        const storesSql = `
            SELECT DISTINCT s.IdSucursal, s.Sucursal as Tienda 
            FROM tblVentas v
            JOIN tblSucursales s ON v.IdSucursal = s.IdSucursal
            WHERE v.Status = 0 AND DATE(v.FechaVenta) >= ? AND DATE(v.FechaVenta) <= ?
            ORDER BY s.Sucursal
        `;
        const stores = await query(storesSql, [fechaInicio, fechaFin]);

        return NextResponse.json({ 
            success: true,
            data: results,
            stores: stores
        });

    } catch (error: any) {
        console.error('Error fetching categories global data:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
