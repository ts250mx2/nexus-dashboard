import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/conversations';
import { moveReport } from '@/lib/advanced-reports/reports-store';

export const runtime = 'nodejs';

/** POST /api/agent/advanced/reports/[id]/move { folderId } → mueve a carpeta (null = raíz). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const idReporte = Number(id);
        if (!Number.isFinite(idReporte) || idReporte <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
        const userId = await getUserId().catch(() => 'anonymous');
        const body = await req.json().catch(() => ({}));
        const folderId = body?.folderId == null ? null : Number(body.folderId);
        await moveReport(userId, idReporte, Number.isFinite(folderId as number) ? (folderId as number) : null);
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Error moviendo reporte' }, { status: 500 });
    }
}
