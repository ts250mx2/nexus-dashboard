import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function PUT(req: Request) {
    let connection;
    try {
        const body = await req.json();
        const {
            zonaId,
            codigo,
            precioPublico,
            precioProfesor,
            precioDistribuidor,
            distribuidoEspecial
        } = body;

        // Input validations
        if (!zonaId || !codigo) {
            return NextResponse.json({ error: 'Faltan parámetros obligatorios (zonaId, codigo)' }, { status: 400 });
        }

        const zId = Number(zonaId);
        const p1 = Number(precioPublico);
        const p2 = Number(precioProfesor);
        const p3 = Number(precioDistribuidor);
        const p4 = Number(distribuidoEspecial);

        if (isNaN(zId) || isNaN(p1) || isNaN(p2) || isNaN(p3) || isNaN(p4)) {
            return NextResponse.json({ error: 'Los valores de precios y zona deben ser numéricos' }, { status: 400 });
        }

        if (p1 < 0 || p2 < 0 || p3 < 0 || p4 < 0) {
            return NextResponse.json({ error: 'Los precios no pueden ser negativos' }, { status: 400 });
        }

        const pool = await getPool();
        connection = await pool.getConnection();

        // Start transaction
        await connection.beginTransaction();

        // 1. Get IdArticulo and PrecioBase from tblArticulos
        const [articulos] = await connection.execute(
            'SELECT IdArticulo, PrecioBase FROM tblArticulos WHERE Codigo = ? AND Status = 0',
            [codigo]
        );

        if (!Array.isArray(articulos) || articulos.length === 0) {
            await connection.rollback();
            return NextResponse.json({ error: `Artículo con código ${codigo} no encontrado o inactivo` }, { status: 404 });
        }

        const articulo = articulos[0] as any;
        const idArticulo = articulo.IdArticulo;
        const precioBase = articulo.PrecioBase || 0;

        // 2. Get previous prices from tblListaPrecios
        const [prevPrices] = await connection.execute(
            'SELECT Precio1, Precio2, Precio3, Precio4 FROM tblListaPrecios WHERE IdZona = ? AND IdArticulo = ?',
            [zId, idArticulo]
        );

        let precioAnt1 = 0;
        let precioAnt2 = 0;
        let precioAnt3 = 0;
        let precioAnt4 = 0;
        let existsInList = false;

        if (Array.isArray(prevPrices) && prevPrices.length > 0) {
            const prev = prevPrices[0] as any;
            precioAnt1 = prev.Precio1 || 0;
            precioAnt2 = prev.Precio2 || 0;
            precioAnt3 = prev.Precio3 || 0;
            precioAnt4 = prev.Precio4 || 0;
            existsInList = true;
        }

        // 3. Update or Insert tblListaPrecios
        const now = new Date();
        const dia = now.getDate();
        const mes = now.getMonth() + 1;
        const anio = now.getFullYear();

        if (existsInList) {
            await connection.execute(
                'UPDATE tblListaPrecios SET Precio1 = ?, Precio2 = ?, Precio3 = ?, Precio4 = ?, FechaAct = ? WHERE IdZona = ? AND IdArticulo = ?',
                [p1, p2, p3, p4, now, zId, idArticulo]
            );
        } else {
            await connection.execute(
                'INSERT INTO tblListaPrecios (IdZona, IdArticulo, Precio1, Precio2, Precio3, Precio4, FechaAct) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [zId, idArticulo, p1, p2, p3, p4, now]
            );
        }

        // 4. Insert into tblListaPreciosHistorial
        // If a change was already registered today, update the prices but preserve original PrecioAnt values
        await connection.execute(
            `INSERT INTO tblListaPreciosHistorial (
                IdZona, IdArticulo, Precio1, Precio2, Precio3, Precio4, FechaAct,
                Dia, Mes, Anio, PrecioBase, PrecioAnt1, PrecioAnt2, PrecioAnt3, PrecioAnt4,
                PrecioBaseAnt, Cambio, Modificado
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
            ON DUPLICATE KEY UPDATE
                Precio1 = VALUES(Precio1),
                Precio2 = VALUES(Precio2),
                Precio3 = VALUES(Precio3),
                Precio4 = VALUES(Precio4),
                FechaAct = VALUES(FechaAct)`,
            [
                zId,
                idArticulo,
                p1,
                p2,
                p3,
                p4,
                now,
                dia,
                mes,
                anio,
                precioBase,
                precioAnt1,
                precioAnt2,
                precioAnt3,
                precioAnt4,
                precioBase, // PrecioBaseAnt
            ]
        );

        // Commit transaction
        await connection.commit();

        return NextResponse.json({
            success: true,
            message: 'Precio actualizado con éxito e historial registrado'
        });

    } catch (error: any) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Error updating price list:', error);
        return NextResponse.json({ error: 'Error de base de datos al guardar precio: ' + error.message }, { status: 500 });
    } finally {
        if (connection) {
            connection.release();
        }
    }
}
