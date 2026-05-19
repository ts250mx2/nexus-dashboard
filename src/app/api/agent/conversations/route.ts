import { NextResponse } from 'next/server';
import {
    listConversations,
    saveConversation,
    getUserId,
    generateTitle
} from '@/lib/conversations';

export async function GET() {
    try {
        const userId = await getUserId();
        const conversations = await listConversations(userId);
        return NextResponse.json({ conversations });
    } catch (error: any) {
        console.error('listConversations error:', error);
        return NextResponse.json(
            { error: error.message || 'Error listando conversaciones', conversations: [] },
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    try {
        const userId = await getUserId();
        const body = await req.json();
        const { id, messages, title } = body;

        if (!id || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'id y messages son requeridos' }, { status: 400 });
        }

        const finalTitle = title || (() => {
            const firstUser = messages.find((m: any) => m.role === 'user');
            return generateTitle(firstUser?.content || 'Conversación');
        })();

        await saveConversation({ userId, id, title: finalTitle, messages });
        return NextResponse.json({ success: true, id, title: finalTitle });
    } catch (error: any) {
        console.error('saveConversation error:', error);
        return NextResponse.json(
            { error: error.message || 'Error guardando conversación' },
            { status: 500 }
        );
    }
}
