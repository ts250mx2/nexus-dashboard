import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;

    // Extraer parámetros de la URL
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const sucursalId = searchParams.get('sucursalId');

    // Validación básica
    if (!startDate || !endDate || !sucursalId) {
        return NextResponse.json({
            error: 'Missing required parameters: startDate, endDate, and sucursalId are required'
        }, { status: 400 });
    }

    try {
        const sqlQuery = `
            SELECT 
                A.IdVenta, 
                A.IdSucursal, 
                A.FolioVenta AS "Folio Venta", 
                A.FechaVenta, 
                A.Cliente, 
                COUNT(H.IdVenta) AS Productos, 
                A.Total, 
                Pago AS "Pago 1", 
                B.TipoPago AS "Tipo Pago 1", 
                C.Banco AS "Banco 1",
                Pago2 AS "Pago 2", 
                D.TipoPago AS "Tipo Pago 2", 
                E.Banco AS "Banco 2",
                Pago3 AS "Pago 3", 
                F.TipoPago AS "Tipo Pago 3", 
                G.Banco AS "Banco 3", 
                I.Sucursal
            FROM tblVentas A
            LEFT JOIN tblTiposPago B ON A.IdTipoPago = B.IdTipoPago
            LEFT JOIN tblBancos C ON A.IdBanco = C.IdBanco
            LEFT JOIN tblTiposPago D ON A.IdTipoPago2 = D.IdTipoPago
            LEFT JOIN tblBancos E ON A.IdBanco2 = E.IdBanco
            LEFT JOIN tblTiposPago F ON A.IdTipoPago3 = F.IdTipoPago
            LEFT JOIN tblBancos G ON A.IdBanco3 = G.IdBanco
            INNER JOIN tblDetalleVentas H ON A.IdVenta = H.IdVenta AND A.IdSucursal = H.IdSucursal
            INNER JOIN tblSucursales I ON A.IdSucursal = I.IdSucursal
            WHERE DATE(FechaVenta) >= ? 
              AND DATE(FechaVenta) <= ? 
              AND A.IdSucursal = ?
            GROUP BY 
                A.FolioVenta, 
                A.FechaVenta, 
                A.Cliente, 
                A.Total, 
                Pago, 
                B.TipoPago, 
                C.Banco, 
                Pago2, 
                D.TipoPago, 
                E.Banco, 
                Pago3, 
                F.TipoPago, 
                G.Banco, 
                I.Sucursal
            ORDER BY A.FechaVenta DESC, A.FolioVenta DESC;
        `;

        const salesData = await query(sqlQuery, [startDate, endDate, sucursalId]);

        return NextResponse.json({
            success: true,
            data: salesData
        });

    } catch (error) {
        console.error('Error in API /ventas-detalle:', error);
        return NextResponse.json({
            error: 'Database error fetching detailed sales'
        }, { status: 500 });
    }
}
