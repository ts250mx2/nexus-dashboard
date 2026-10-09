import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/** Cierra la sesión borrando la cookie; sin esto el middleware regresa /login al dashboard. */
export async function POST() {
    (await cookies()).delete('session');
    return NextResponse.json({ success: true });
}
