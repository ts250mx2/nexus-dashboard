import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/conversations';
import { getReportById } from '@/lib/advanced-reports/reports-store';
import { substituteParams, substituteClicked } from '@/lib/advanced-reports/params';
import { assertReadOnly } from '@/lib/sql-sandbox';
import { query } from '@/lib/db';
import type { ReportDrill } from '@/lib/advanced-reports/types';

export const runtime = 'nodejs';

/**
 * POST /api/agent/advanced/reports/[id]/drill
 *
 * Drill-down: re-ejecuta el SQL de detalle del bloque (o del reporte single)
 * filtrado por el VALOR CLICKEADO + los filtros globales actuales del visor.
 * Es read-only y NO modifica el reporte.
 *
 * Body: { blockId?: string, clicked: string, params?: Record<string,string> }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const idReporte = Number(id);
    if (!Number.isFinite(idReporte) || idReporte <= 0) {
        return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }

    const userId = await getUserId().catch(() => 'anonymous');
    const body = await req.json().catch(() => ({}));
    const clicked = String(body?.clicked ?? '').trim();
    if (!clicked) {
        return NextResponse.json({ error: 'Falta el valor clickeado' }, { status: 400 });
    }

    const report = await getReportById(userId, idReporte);
    if (!report || !report.definition) {
        return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 });
    }
    const def = report.definition;

    // Resuelve la config de drill: por bloque (blockId) o la del reporte single.
    let drill: ReportDrill | undefined = def.drill;
    const blockId = body?.blockId ? String(body.blockId) : null;
    if (blockId && Array.isArray(def.blocks)) {
        const block = def.blocks.find((b) => b.id === blockId);
        drill = block?.drill;
    }
    if (!drill?.sql) {
        return NextResponse.json({ error: 'Este elemento no tiene detalle configurado' }, { status: 400 });
    }

    // Valores de los params globales (período/sucursal) que vienen del visor.
    const values: Record<string, string> = (body?.params && typeof body.params === 'object') ? body.params : {};

    try {
        let sql = substituteParams(drill.sql, def.params, values);
        sql = substituteClicked(sql, clicked);
        sql = assertReadOnly(sql);
        const rows = (await query(sql)) as any[];
        return NextResponse.json({
            rows: rows.slice(0, 500),
            rowCount: rows.length,
            visualization: drill.visualization || 'table',
            clicked,
        });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Error obteniendo el detalle' }, { status: 500 });
    }
}
