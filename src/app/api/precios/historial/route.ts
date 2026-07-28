import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const rawZonaId = searchParams.get('zonaId');
        const codigo = searchParams.get('codigo');
        const rawYears = searchParams.get('years') || '3'; // Default to last 3 years

        if (!rawZonaId || !codigo) {
            return NextResponse.json({ error: 'Faltan parámetros obligatorios (zonaId, codigo)' }, { status: 400 });
        }

        const zonaId = Number(rawZonaId);
        const years = Number(rawYears);

        if (isNaN(zonaId) || isNaN(years) || zonaId <= 0 || years <= 0) {
            return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
        }

        // 1. Get IdArticulo from tblArticulos
        const articulos = await query(
            'SELECT IdArticulo, Descripcion FROM tblArticulos WHERE Codigo = ? AND Status = 0',
            [codigo]
        );

        if (!articulos || articulos.length === 0) {
            return NextResponse.json({ error: 'Artículo no encontrado o inactivo' }, { status: 404 });
        }

        const idArticulo = articulos[0].IdArticulo;
        const descripcion = articulos[0].Descripcion;

        // 2. Generate composite date tuples [Dia, Mes, Anio] for the last N years
        const dateTuples: [number, number, number][] = [];
        const now = new Date();
        const daysToQuery = Math.min(365 * years, 1825); // Limit to max 5 years (1825 days) to avoid query size limits

        for (let i = 0; i < daysToQuery; i++) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            dateTuples.push([d.getDate(), d.getMonth() + 1, d.getFullYear()]);
        }

        // 3. Query history with date tuples to ensure composite index utilization (Dia, Mes, Anio, IdArticulo)
        // Since mysql2 requires passing the nested array: [ [ [dia, mes, anio], [dia, mes, anio] ] ]
        // We use query library from '@/lib/db' but it calls pool.execute or pool.query?
        // Let's check our '@/lib/db' implementation. It does connection.execute.
        // Wait! connection.execute does NOT support large array parameter insertion in some MySQL drivers,
        // but query() in '@/lib/db' runs connection.execute.
        // Wait, does connection.execute support composite IN clauses with array parameter?
        // Yes, connection.execute and connection.query both compile parameters, but connection.query is safer for composite arrays.
        // Wait! Let's check if `@/lib/db` query supports it. Let's see if we need to get the pool directly and call query.
        // Yes! Getting the pool directly is safer because it allows using connection.query instead of connection.execute.
        // Let's do that!
        
        const { getPool } = await import('@/lib/db');
        const pool = await getPool();
        const [rows] = await pool.query(
            `SELECT 
                Precio1, Precio2, Precio3, Precio4,
                PrecioAnt1, PrecioAnt2, PrecioAnt3, PrecioAnt4,
                PrecioBase, PrecioBaseAnt,
                FechaAct, Dia, Mes, Anio, Cambio, Modificado
            FROM tblListaPreciosHistorial
            WHERE IdZona = ? AND IdArticulo = ? AND (Dia, Mes, Anio) IN (?)
            ORDER BY Anio DESC, Mes DESC, Dia DESC, FechaAct DESC`,
            [zonaId, idArticulo, dateTuples]
        );

        return NextResponse.json({
            success: true,
            data: rows,
            meta: {
                codigo,
                descripcion,
                idArticulo,
                zonaId,
                recordsFound: (rows as any[]).length
            }
        });

    } catch (error: any) {
        console.error('Error fetching price history:', error);
        return NextResponse.json({ error: 'Error al consultar historial: ' + error.message }, { status: 500 });
    }
}
