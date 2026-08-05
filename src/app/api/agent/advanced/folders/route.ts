import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/conversations';
import { listFolders, createFolder, deleteFolder } from '@/lib/advanced-reports/reports-store';

export const runtime = 'nodejs';

/** GET → carpetas del usuario. */
export async function GET() {
    try {
        const userId = await getUserId().catch(() => 'anonymous');
        const folders = await listFolders(userId);
        return NextResponse.json({ folders });
    } catch (err: any) {
        return NextResponse.json({ folders: [], error: err?.message }, { status: 200 });
    }
}

/** POST { nombre } → crea una carpeta. */
export async function POST(req: Request) {
    try {
        const userId = await getUserId().catch(() => 'anonymous');
        const body = await req.json();
        const nombre = String(body?.nombre || '').trim();
        if (!nombre) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
        const idFolder = await createFolder(userId, nombre);
        return NextResponse.json({ idFolder });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Error creando carpeta' }, { status: 500 });
    }
}

/** DELETE ?id= → borra la carpeta (sus reportes vuelven a la raíz). */
export async function DELETE(req: Request) {
    try {
        const userId = await getUserId().catch(() => 'anonymous');
        const id = Number(new URL(req.url).searchParams.get('id'));
        if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
        await deleteFolder(userId, id);
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Error eliminando carpeta' }, { status: 500 });
    }
}
