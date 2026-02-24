import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;

    const idVenta = searchParams.get('idVenta');
    const idSucursal = searchParams.get('idSucursal');

    if (!idVenta || !idSucursal) {
        return NextResponse.json({
            error: 'Missing required parameters: idVenta and idSucursal are required'
        }, { status: 400 });
    }

    try {
        const sqlQuery = `
            SELECT 
                Cantidad, 
                DescripcionVenta AS "Descripcion", 
                PrecioVenta AS "Precio", 
                Descuento, 
                Cantidad * PrecioVenta AS Total
            FROM tblDetalleVentas 
            WHERE IdVenta = ? AND IdSucursal = ? 
            ORDER BY DescripcionVenta
        `;

        const itemsData = await query(sqlQuery, [idVenta, idSucursal]);

        return NextResponse.json({
            success: true,
            data: itemsData
        });

    } catch (error) {
        console.error('Error in API /ventas-items:', error);
        return NextResponse.json({
            error: 'Database error fetching ticket items'
        }, { status: 500 });
    }
}
