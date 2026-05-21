import { NextResponse } from 'next/server';
import {
    listPendingPrompts,
    resolvePrompt,
    generateProactivePromptsFromInsights
} from '@/lib/proactive-prompts';
import { getUserId } from '@/lib/conversations';

export async function GET() {
    try {
        const userId = await getUserId();
        const prompts = await listPendingPrompts(userId);
        return NextResponse.json({ prompts });
    } catch (error: any) {
        console.error('listPendingPrompts error:', error);
        return NextResponse.json(
            { error: error.message || 'Error listando prompts', prompts: [] },
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    try {
        const userId = await getUserId();
        const body = await req.json();

        if (body.action === 'resolve' && body.id && body.status) {
            if (!['accepted', 'dismissed'].includes(body.status)) {
                return NextResponse.json({ error: 'status inválido' }, { status: 400 });
            }
            await resolvePrompt(userId, body.id, body.status);
            return NextResponse.json({ success: true });
        }

        if (body.action === 'generate' && Array.isArray(body.insights)) {
            const generated = await generateProactivePromptsFromInsights({
                userId,
                insights: body.insights
            });
            return NextResponse.json({ success: true, generated });
        }

        return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
    } catch (error: any) {
        console.error('proactive-prompts POST error:', error);
        return NextResponse.json(
            { error: error.message || 'Error procesando solicitud' },
            { status: 500 }
        );
    }
}
