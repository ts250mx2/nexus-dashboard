import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const idTienda = searchParams.get('idTienda') || 'all';

        if (!startDate || !endDate) {
            return NextResponse.json(
                { error: 'Parameters startDate and endDate are required' },
                { status: 400 }
            );
        }

        // Format dates to include full day range
        const start = `${startDate} 00:00:00`;
        const end = `${endDate} 23:59:59`;

        let sql = `
            SELECT 
                R.IdRetiro,
                R.FechaRetiro,
                R.Efectivo,
                R.Status,
                R.TipoRetiro,
                R.IdApertura,
                R.IdUsuario,
                S.Nombre AS Tienda,
                COALESCE(U.Usuario, 'Usuario Desconocido') AS Cajero
            FROM tblRetiros R
            INNER JOIN tblSucursales S ON R.IdSucursal = S.IdSucursal
            LEFT JOIN tblUsuarios U ON R.IdUsuario = U.IdUsuario
            WHERE R.FechaRetiro BETWEEN ? AND ?
        `;

        const queryParams: any[] = [start, end];

        if (idTienda !== 'all') {
            sql += ` AND R.IdSucursal = ?`;
            queryParams.push(Number(idTienda));
        }

        sql += ` ORDER BY R.FechaRetiro DESC`;

        const results = await query(sql, queryParams);
        return NextResponse.json(results);

    } catch (error: any) {
        console.error('Error fetching cash withdrawals (retiros):', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
