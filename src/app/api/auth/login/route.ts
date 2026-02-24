import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { encrypt } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
    try {
        const { username, password } = await request.json();

        // Validate against tblUsuarios
        // In MySQL, we query login and Passwd
        const result = await query(
            'SELECT * FROM tblUsuarios WHERE login = ? AND Passwd = ?',
            [username, password]
        );

        if (result && result.length > 0) {
            const user = result[0];
            const sessionData = { username: user.login, id: user.IdUsuario }; // Adjust based on table schema
            const expires = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
            const session = await encrypt(sessionData);

            (await cookies()).set('session', session, { expires, httpOnly: true });

            return NextResponse.json({ success: true, message: 'Login successful' });
        } else {
            return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
        }
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
    }
}
