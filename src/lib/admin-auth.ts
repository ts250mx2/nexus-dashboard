import { getSession } from '@/lib/auth';

/**
 * Acceso a pantallas de administración (Configuración). Exige sesión del portal
 * y, si ADMIN_USERS está definido ("admin, jperez"), que el usuario esté en esa
 * lista. Sin ADMIN_USERS, cualquier usuario con sesión es administrador.
 */

export type AccesoAdmin = { ok: true; usuario: string } | { ok: false; status: 401 | 403; error: string };

export async function accesoAdmin(): Promise<AccesoAdmin> {
    const session = await getSession().catch(() => null);
    const usuario = typeof session?.username === 'string' ? session.username : '';
    if (!usuario) return { ok: false, status: 401, error: 'No autorizado' };

    const admins = (process.env.ADMIN_USERS ?? '')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
    if (admins.length > 0 && !admins.includes(usuario.toLowerCase())) {
        return { ok: false, status: 403, error: 'Solo un administrador puede cambiar la configuración.' };
    }
    return { ok: true, usuario };
}
