import { NextResponse } from 'next/server';
import { listAlertEvents, markAllEventsRead, markEventRead } from '@/lib/alerts';
import { getUserId } from '@/lib/conversations';

export async function GET(req: Request) {
    try {
        const userId = await getUserId();
        const url = new URL(req.url);
        const onlyUnread = url.searchParams.get('unread') === 'true';
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        const events = await listAlertEvents(userId, { onlyUnread, limit });
        return NextResponse.json({ events });
    } catch (error: any) {
        return NextResponse.json({ error: error.message, events: [] }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const userId = await getUserId();
        const body = await req.json();
        if (body.markAll) {
            await markAllEventsRead(userId);
        } else if (body.eventId) {
            await markEventRead(userId, body.eventId);
        }
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
