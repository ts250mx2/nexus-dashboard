import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

/**
 * Acceso a pantallas de administración (Configuración). Exige sesión del portal
 * y, si ADMIN_USERS está definido ("admin, jperez"), que el usuario esté en esa
 * lista. Sin ADMIN_USERS, cualquier usuario con sesión es administrador.
 */

export type AccesoAdmin = { ok: true; usuario: string } | { ok: false; status: 401 | 403; error: string };

/**
 * Login del usuario de la sesión. Las sesiones creadas antes de corregir el
 * login no traen `username` (leía la columna con otro nombre) pero sí el
 * IdUsuario: en ese caso se busca en tblUsuarios.
 */
async function loginDeSesion(session: Record<string, unknown>): Promise<string> {
    if (typeof session.username === 'string' && session.username) return session.username;
    const id = Number(session.id);
    if (!Number.isInteger(id) || id <= 0) return '';
    const rows = (await query('SELECT Login FROM tblUsuarios WHERE IdUsuario = ?', [id])) as { Login?: unknown }[];
    return rows[0]?.Login ? String(rows[0].Login) : '';
}

export async function accesoAdmin(): Promise<AccesoAdmin> {
    const session = await getSession().catch(() => null);
    if (!session) return { ok: false, status: 401, error: 'No autorizado' };
    const usuario = await loginDeSesion(session).catch(() => '');
    if (!usuario) return { ok: false, status: 401, error: 'No se pudo identificar tu usuario. Cierra sesión y vuelve a entrar.' };

    const admins = (process.env.ADMIN_USERS ?? '')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
    if (admins.length > 0 && !admins.includes(usuario.toLowerCase())) {
        return { ok: false, status: 403, error: `El usuario «${usuario}» no está en ADMIN_USERS; solo un administrador puede cambiar la configuración.` };
    }
    return { ok: true, usuario };
}
