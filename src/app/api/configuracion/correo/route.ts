import { NextRequest, NextResponse } from 'next/server';
import { accesoAdmin } from '@/lib/admin-auth';
import { ConfigInvalida, guardarConfig, leerConfigVista } from '@/lib/config/correo-config';
import { validarConfigCorreo } from '@/lib/correos';
import { listarSucursalesInventario } from '@/lib/inventory/sucursales';
import { configLimiter } from '@/lib/rate-limit';

/**
 * CONFIGURACIÓN DE CORREO
 *
 * GET → SMTP de salida (sin contraseña), correos generales del cierre y correos por sucursal.
 * PUT → guarda todo. `smtp.pass` vacío conserva la contraseña guardada.
 */

export async function GET() {
    const acceso = await accesoAdmin();
    if (!acceso.ok) return NextResponse.json({ success: false, error: acceso.error }, { status: acceso.status });
    try {
        return NextResponse.json({ success: true, data: await leerConfigVista() });
    } catch (error: unknown) {
        console.error('Error al leer la configuración de correo:', error);
        return NextResponse.json({ success: false, error: 'No se pudo leer la configuración de correo.' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const acceso = await accesoAdmin();
    if (!acceso.ok) return NextResponse.json({ success: false, error: acceso.error }, { status: acceso.status });
    if (!configLimiter.check(`config:${acceso.usuario}`).allowed) {
        return NextResponse.json({ success: false, error: 'Demasiados cambios seguidos; espera un minuto.' }, { status: 429 });
    }

    try {
        const body = await req.json().catch(() => null);
        const sucursales = new Map((await listarSucursalesInventario()).map(s => [s.IdSucursal, s.Sucursal]));
        const v = validarConfigCorreo(body, sucursales);
        if (!v.ok) return NextResponse.json({ success: false, error: v.error }, { status: 400 });

        await guardarConfig(v.data, acceso.usuario);
        return NextResponse.json({ success: true, data: await leerConfigVista() });
    } catch (error: unknown) {
        if (error instanceof ConfigInvalida) {
            return NextResponse.json({ success: false, error: error.message }, { status: 400 });
        }
        console.error('Error al guardar la configuración de correo:', error);
        return NextResponse.json({ success: false, error: 'No se pudo guardar la configuración de correo.' }, { status: 500 });
    }
}
