import { NextResponse } from 'next/server';
import {
    listPlaybooks,
    createPlaybook,
    generatePlaybookId,
    PlaybookStep
} from '@/lib/playbooks';
import { getUserId } from '@/lib/conversations';

export async function GET() {
    try {
        const userId = await getUserId();
        const playbooks = await listPlaybooks(userId);
        return NextResponse.json({ playbooks });
    } catch (error: any) {
        console.error('listPlaybooks error:', error);
        return NextResponse.json(
            { error: error.message || 'Error listando playbooks', playbooks: [] },
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    try {
        const userId = await getUserId();
        const body = await req.json();
        const { name, description, steps } = body;

        if (!name || !Array.isArray(steps) || steps.length === 0) {
            return NextResponse.json(
                { error: 'name y steps (array no vacío) son requeridos' },
                { status: 400 }
            );
        }

        const cleanSteps: PlaybookStep[] = steps
            .filter((s: any) => typeof s?.prompt === 'string' && s.prompt.trim())
            .map((s: any) => ({
                prompt: String(s.prompt).slice(0, 2000),
                label: s.label ? String(s.label).slice(0, 100) : undefined
            }));

        if (cleanSteps.length === 0) {
            return NextResponse.json({ error: 'Ningún paso válido' }, { status: 400 });
        }

        const id = generatePlaybookId();
        await createPlaybook({
            id,
            userId,
            name,
            description: description || null,
            steps: cleanSteps
        });

        return NextResponse.json({ success: true, id });
    } catch (error: any) {
        console.error('createPlaybook error:', error);
        return NextResponse.json(
            { error: error.message || 'Error creando playbook' },
            { status: 500 }
        );
    }
}
