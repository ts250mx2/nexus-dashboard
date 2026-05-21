import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { searchSimilar } from '@/lib/semantic-memory';

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

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const prompt = searchParams.get('q') || '';
        if (!prompt || prompt.length < 6) {
            return NextResponse.json({ hits: [] });
        }

        const userId = await getUserIdFromCookie();
        const hits = await searchSimilar({
            userId,
            prompt,
            threshold: 0.82,
            topN: 3
        });
        return NextResponse.json({ hits });
    } catch (e: any) {
        console.error('Similar GET error:', e);
        return NextResponse.json({ error: e.message, hits: [] }, { status: 500 });
    }
}
