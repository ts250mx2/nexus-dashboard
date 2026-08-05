import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/conversations';
import { listReportsByUser, softDeleteReport } from '@/lib/advanced-reports/reports-store';

export const runtime = 'nodejs';

/** GET /api/agent/advanced/reports → reportes del usuario para la galería. */
export async function GET() {
    try {
        const userId = await getUserId().catch(() => 'anonymous');
        const reports = await listReportsByUser(userId);
        return NextResponse.json({ reports });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Error listando reportes', reports: [] }, { status: 500 });
    }
}

/** DELETE /api/agent/advanced/reports?id=123 → soft-delete. */
export async function DELETE(req: Request) {
    try {
        const userId = await getUserId().catch(() => 'anonymous');
        const id = Number(new URL(req.url).searchParams.get('id'));
        if (!Number.isFinite(id) || id <= 0) {
            return NextResponse.json({ error: 'id inválido' }, { status: 400 });
        }
        await softDeleteReport(userId, id);
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Error eliminando reporte' }, { status: 500 });
    }
}
