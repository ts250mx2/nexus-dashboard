import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/conversations';
import { listSessions, upsertSession, deleteSession } from '@/lib/advanced-reports/sessions-store';

export const runtime = 'nodejs';

/** GET → conversaciones del usuario (pestañas) para abrir desde cualquier equipo. */
export async function GET() {
    try {
        const userId = await getUserId().catch(() => 'anonymous');
        const sessions = await listSessions(userId);
        return NextResponse.json({ sessions });
    } catch (err: any) {
        return NextResponse.json({ sessions: [], error: err?.message || 'Error' }, { status: 200 });
    }
}

/** POST → guarda/actualiza una conversación { id, title, lines, history }. */
export async function POST(req: Request) {
    try {
        const userId = await getUserId().catch(() => 'anonymous');
        const body = await req.json();
        if (!body?.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
        await upsertSession(userId, {
            id: String(body.id),
            title: String(body.title || 'Agente'),
            lines: Array.isArray(body.lines) ? body.lines : [],
            history: Array.isArray(body.history) ? body.history : [],
            editingReportId: typeof body.editingReportId === 'number' ? body.editingReportId : null,
        });
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Error guardando sesión' }, { status: 500 });
    }
}

/** DELETE ?id= → elimina (soft) una conversación. */
export async function DELETE(req: Request) {
    try {
        const userId = await getUserId().catch(() => 'anonymous');
        const id = new URL(req.url).searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
        await deleteSession(userId, id);
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Error eliminando sesión' }, { status: 500 });
    }
}
