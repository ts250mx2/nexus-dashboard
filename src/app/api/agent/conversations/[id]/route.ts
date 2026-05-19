import { NextResponse } from 'next/server';
import { getConversation, deleteConversation, getUserId } from '@/lib/conversations';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const userId = await getUserId();
        const conv = await getConversation(userId, id);
        if (!conv) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
        return NextResponse.json({ conversation: conv });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Error obteniendo conversación' }, { status: 500 });
    }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const userId = await getUserId();
        await deleteConversation(userId, id);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Error borrando conversación' }, { status: 500 });
    }
}
