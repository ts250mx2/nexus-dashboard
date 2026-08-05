import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/conversations';
import { getReportById } from '@/lib/advanced-reports/reports-store';
import { substituteParams } from '@/lib/advanced-reports/params';
import { assertReadOnly } from '@/lib/sql-sandbox';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * GET /api/agent/advanced/reports/[id]/data
 *
 * Re-ejecuta el SQL guardado (read-only) y devuelve filas + definición para
 * que el visor lo renderice dinámicamente. El reporte es "vivo": refleja datos
 * actuales en cada visita (no es un snapshot). Crear reportes NO requiere deploy.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const idReporte = Number(id);
    if (!Number.isFinite(idReporte) || idReporte <= 0) {
        return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    const userId = await getUserId().catch(() => 'anonymous');
    const report = await getReportById(userId, idReporte);
    if (!report || !report.definition) {
        return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 });
    }

    const def = report.definition;
    const cost = {
        realCostoUsd: report.realCostoUsd,
        realCostoMxn: report.realCostoMxn,
        estCostoMxn: report.estCostoMxn,
        tokensInput: report.realTokensInput,
        tokensOutput: report.realTokensOutput,
    };
    const meta = {
        title: report.titulo,
        descripcion: report.descripcion,
        modelo: report.modelo,
        cost,
        fechaCreacion: report.fechaCreacion,
    };

    // Los params son GLOBALES: un solo set de valores alimenta todos los bloques.
    const url = new URL(req.url);
    const values: Record<string, string> = {};
    if (Array.isArray(def.params)) {
        for (const p of def.params) {
            const v = url.searchParams.get(p.token);
            if (v !== null) values[p.token] = v;
        }
    }

    // ── Camino multi-bloque (tablero): resuelve cada bloque ───────────────────
    // Un bloque que falla NO tumba el reporte: devuelve su error y los demás
    // se renderizan igual.
    if (Array.isArray(def.blocks) && def.blocks.length > 0) {
        const blocks = await Promise.all(
            def.blocks.map(async (b) => {
                if (b.type === 'narrative' || !b.sql) {
                    return { ...b, rows: [], rowCount: 0 };
                }
                try {
                    const sql = assertReadOnly(substituteParams(b.sql, def.params, values));
                    const rows = (await query(sql)) as any[];
                    const rowLimit = typeof b.rowLimit === 'number' ? b.rowLimit : 500;
                    return { ...b, rows: rows.slice(0, rowLimit), rowCount: rows.length };
                } catch (e: any) {
                    return { ...b, rows: [], rowCount: 0, error: e?.message || 'Error ejecutando el bloque' };
                }
            })
        );
        return NextResponse.json({ definition: def, blocks, ...meta });
    }

    // ── Camino single (v1): un SQL + una visualización ───────────────────────
    try {
        const sql = assertReadOnly(substituteParams(def.sql, def.params, values));
        const rows = (await query(sql)) as any[];
        const rowLimit = typeof def.rowLimit === 'number' ? def.rowLimit : 500;
        const limited = rows.slice(0, rowLimit);

        return NextResponse.json({
            definition: def,
            rows: limited,
            rowCount: rows.length,
            ...meta,
        });
    } catch (e: any) {
        return NextResponse.json(
            { error: e?.message || 'Error ejecutando el reporte', definition: def },
            { status: 500 }
        );
    }
}
