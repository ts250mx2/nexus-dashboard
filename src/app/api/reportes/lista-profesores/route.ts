import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Lista de Profesores (directorio).
 *
 * Devuelve el padrón completo de profesores activos con sus datos de contacto,
 * sucursal, fecha de alta y fecha de última compra, ordenado alfabéticamente.
 *
 * Dos campos son derivados porque la BD no los guarda de forma directa:
 *
 *  - Sucursal: `tblSocios.IdSucursal` está vacío (0 o NULL) en ~58% del padrón,
 *    así que cuando no hay sucursal de registro se infiere la sucursal donde
 *    ocurrió su última compra. La bandera `SucursalInferida` marca esos casos.
 *
 *  - FechaAlta: `tblSocios` sólo tiene `FechaAct`, que se sobrescribe al editar
 *    el registro. Se toma la más antigua entre `FechaAct` y la primera compra,
 *    porque un profesor no pudo comprar antes de haber sido dado de alta.
 */

/** Sucursales lógicas que no son punto de venta y no deben atribuirse a un profesor. */
const SUCURSAL_NO_ASIGNADA = 0;

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const sucursalId = searchParams.get('sucursalId');
        const conCompras = searchParams.get('conCompras'); // 'si' | 'no' | null (todos)

        let sql = `
            SELECT
                S.IdSocio,
                S.Socio AS Profesor,
                NULLIF(TRIM(S.Telefonos), '') AS Telefono,
                NULLIF(TRIM(S.CorreoElectronico), '') AS Correo,
                COALESCE(SUC_REG.IdSucursal, V.IdSucursalUltima) AS IdSucursal,
                COALESCE(SUC_REG.Sucursal, SUC_ULT.Sucursal) AS Sucursal,
                CASE
                    WHEN SUC_REG.IdSucursal IS NULL AND V.IdSucursalUltima IS NOT NULL THEN 1
                    ELSE 0
                END AS SucursalInferida,
                CASE
                    WHEN V.PrimeraCompra IS NOT NULL AND V.PrimeraCompra < S.FechaAct THEN V.PrimeraCompra
                    ELSE S.FechaAct
                END AS FechaAlta,
                V.UltimaCompra,
                V.TotalCompras,
                DATEDIFF(CURDATE(), V.UltimaCompra) AS DiasSinComprar
            FROM tblSocios S
            LEFT JOIN tblSucursales SUC_REG
                ON SUC_REG.IdSucursal = S.IdSucursal AND S.IdSucursal <> ${SUCURSAL_NO_ASIGNADA}
            LEFT JOIN (
                SELECT
                    IdSocio,
                    MIN(FechaVenta) AS PrimeraCompra,
                    MAX(FechaVenta) AS UltimaCompra,
                    COUNT(*) AS TotalCompras,
                    -- Sucursal de la venta más reciente. GROUP_CONCAT puede truncar
                    -- por group_concat_max_len, pero el primer elemento (el que se
                    -- extrae) nunca se pierde porque el orden es descendente.
                    CAST(SUBSTRING_INDEX(
                        GROUP_CONCAT(IdSucursal ORDER BY FechaVenta DESC), ',', 1
                    ) AS UNSIGNED) AS IdSucursalUltima
                FROM tblVentas
                WHERE Status = 0
                GROUP BY IdSocio
            ) V ON V.IdSocio = S.IdSocio
            LEFT JOIN tblSucursales SUC_ULT ON SUC_ULT.IdSucursal = V.IdSucursalUltima
            WHERE S.Status = 0
        `;

        const params: any[] = [];

        if (conCompras === 'si') {
            sql += ` AND V.IdSocio IS NOT NULL`;
        } else if (conCompras === 'no') {
            sql += ` AND V.IdSocio IS NULL`;
        }

        // El filtro va en HAVING porque IdSucursal es una columna derivada.
        if (sucursalId !== null && sucursalId !== 'all') {
            const ids = sucursalId.split(',').filter(id => /^\d+$/.test(id.trim()));
            if (ids.length === 0) {
                return NextResponse.json({ success: true, data: [] });
            }
            const placeholders = ids.map(() => '?').join(',');
            sql += ` HAVING IdSucursal IN (${placeholders})`;
            params.push(...ids);
        }

        sql += ` ORDER BY S.Socio ASC`;

        const rows = await query(sql, params);

        // mysql2 devuelve el CAST ... AS UNSIGNED como string; se normaliza aquí
        // para que el cliente pueda comparar ids sin castear en cada render.
        const data = (rows as any[]).map(r => ({
            ...r,
            IdSucursal: r.IdSucursal === null ? null : Number(r.IdSucursal),
            TotalCompras: r.TotalCompras === null ? 0 : Number(r.TotalCompras)
        }));

        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error('Error in API /reportes/lista-profesores:', error);
        return NextResponse.json({ error: 'Database error fetching teacher list' }, { status: 500 });
    }
}
