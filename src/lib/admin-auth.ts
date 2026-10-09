import { getSession } from '@/lib/auth';

/**
 * Acceso a pantallas de administración (Configuración). Exige sesión del portal
 * y, si ADMIN_USERS está definido ("admin, jperez"), que el usuario esté en esa
 * lista. Sin ADMIN_USERS, cualquier usuario con sesión es administrador.
 */

export type AccesoAdmin = { ok: true; usuario: string } | { ok: false; status: 401 | 403; error: string };

export async function accesoAdmin(): Promise<AccesoAdmin> {
    const session = await getSession().catch(() => null);
    if (!session) return { ok: false, status: 401, error: 'No autorizado' };
    const usuario = typeof session.username === 'string' ? session.username : '';
    // Sesiones abiertas antes de corregir el login no traen el usuario.
    if (!usuario) return { ok: false, status: 401, error: 'Tu sesión no trae el usuario. Cierra sesión y vuelve a entrar.' };

    const admins = (process.env.ADMIN_USERS ?? '')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
    if (admins.length > 0 && !admins.includes(usuario.toLowerCase())) {
        return { ok: false, status: 403, error: 'Solo un administrador puede cambiar la configuración.' };
    }
    return { ok: true, usuario };
}
