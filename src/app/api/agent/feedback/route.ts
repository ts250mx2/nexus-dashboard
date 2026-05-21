import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { recordFeedback, getFeedbackStats } from '@/lib/agent-feedback';

const SECRET_KEY = new TextEncoder().encode(
    process.env.JWT_SECRET || 'your-secret-key-here'
);

async function getUserIdFromCookie(): Promise<string | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('session');
        if (!token) return null;
        const { payload } = await jwtVerify(token.value, SECRET_KEY);
        const id = (payload as any).id;
        return id != null ? String(id) : null;
    } catch {
        return null;
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { messageId, conversationId, rating, reason, prompt, response, sql, aiModel } = body;

        if (!messageId) {
            return NextResponse.json({ error: 'Falta messageId' }, { status: 400 });
        }
        if (rating !== 'up' && rating !== 'down') {
            return NextResponse.json({ error: 'rating debe ser "up" o "down"' }, { status: 400 });
        }

        const userId = await getUserIdFromCookie();

        await recordFeedback({
            messageId,
            conversationId: conversationId || null,
            userId,
            rating,
            reason: reason || null,
            prompt: prompt || null,
            response: response || null,
            sql: sql || null,
            aiModel: aiModel || null
        });

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('Feedback POST error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const daysBack = parseInt(searchParams.get('days') || '30', 10);
        const stats = await getFeedbackStats(daysBack);
        return NextResponse.json(stats);
    } catch (e: any) {
        console.error('Feedback GET error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
