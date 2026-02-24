import { NextRequest, NextResponse } from 'next/server';
import { decrypt } from '@/lib/auth';

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const session = request.cookies.get('session')?.value;

    // Redirect root to login
    if (pathname === '/') {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Protect dashboard routes
    if (pathname.startsWith('/dashboard')) {
        if (!session) {
            return NextResponse.redirect(new URL('/login', request.url));
        }

        try {
            await decrypt(session);
        } catch (error) {
            return NextResponse.redirect(new URL('/login', request.url));
        }
    }

    // Prevent access to login if already authenticated
    if (pathname === '/login' && session) {
        try {
            await decrypt(session);
            return NextResponse.redirect(new URL('/dashboard', request.url));
        } catch (error) {
            // Invalid session, allow access to login
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/', '/login', '/dashboard/:path*'],
};
