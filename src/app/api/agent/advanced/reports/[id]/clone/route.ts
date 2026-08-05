import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/conversations';
import { cloneReport } from '@/lib/advanced-reports/reports-store';

export const runtime = 'nodejs';

/** POST /api/agent/advanced/reports/[id]/clone → crea una copia "(copia)". */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const idReporte = Number(id);
        if (!Number.isFinite(idReporte) || idReporte <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
        const userId = await getUserId().catch(() => 'anonymous');
        const newId = await cloneReport(userId, idReporte);
        if (!newId) return NextResponse.json({ error: 'No se pudo clonar (reporte no encontrado)' }, { status: 404 });
        return NextResponse.json({ idReporte: newId, url: `/dashboard/reportes-ia/mis-reportes/${newId}` });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Error clonando' }, { status: 500 });
    }
}
