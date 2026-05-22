import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const sql = `
            SELECT
                B.IdSucursal,
                B.Sucursal,
                SUM(CASE WHEN A.Exi > 0 THEN A.Exi * A.PrecioBase ELSE 0 END) AS CostoPositivo,
                SUM(CASE WHEN A.Exi > 0 THEN 1 ELSE 0 END) AS ProductosPositivo,
                SUM(CASE WHEN A.Exi = 0 THEN A.Exi * A.PrecioBase ELSE 0 END) AS CostoCero,
                SUM(CASE WHEN A.Exi = 0 THEN 1 ELSE 0 END) AS ProductosCero,
                SUM(CASE WHEN A.Exi < 0 THEN A.Exi * A.PrecioBase ELSE 0 END) AS CostoNegativo,
                SUM(CASE WHEN A.Exi < 0 THEN 1 ELSE 0 END) AS ProductosNegativo,
                SUM(CASE WHEN A.Exi < C.ExiMinRes AND C.ExiMinRes > 0 THEN 1 ELSE 0 END) AS EnAlerta
            FROM tblCostoInventario A
            INNER JOIN tblSucursales B ON A.IdSucursal = B.IdSucursal
            LEFT JOIN tblConfiguracionResurtido C ON A.IdArticulo = C.IdArticulo AND A.IdSucursal = C.IdSucursal
            WHERE LOWER(B.Sucursal) NOT LIKE '%fiscal%'
              AND LOWER(B.Sucursal) NOT LIKE '%prueba%'
            GROUP BY B.IdSucursal, B.Sucursal
            ORDER BY B.IdSucursal
        `;

        const results: any = await query(sql);

        // Calculate consolidated global metrics
        let totalCostoPositivo = 0;
        let totalCostoNegativo = 0;
        let totalProductosPositivo = 0;
        let totalProductosCero = 0;
        let totalProductosNegativo = 0;
        let totalEnAlerta = 0;

        results.forEach((row: any) => {
            totalCostoPositivo += Number(row.CostoPositivo || 0);
            totalCostoNegativo += Number(row.CostoNegativo || 0);
            totalProductosPositivo += Number(row.ProductosPositivo || 0);
            totalProductosCero += Number(row.ProductosCero || 0);
            totalProductosNegativo += Number(row.ProductosNegativo || 0);
            totalEnAlerta += Number(row.EnAlerta || 0);
        });

        const kpis = {
            inventarioValorizado: totalCostoPositivo, // User defined: "valor del inventario = costo positivo"
            netValorizado: totalCostoPositivo + totalCostoNegativo,
            costoPositivo: totalCostoPositivo,
            costoNegativo: totalCostoNegativo,
            productosPositivo: totalProductosPositivo,
            productosCero: totalProductosCero,
            productosNegativo: totalProductosNegativo,
            enAlerta: totalEnAlerta,
        };

        return NextResponse.json({
            success: true,
            data: results,
            kpis,
        });

    } catch (error: any) {
        console.error('Error fetching inventory cost summary:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
