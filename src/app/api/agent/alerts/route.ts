import { NextResponse } from 'next/server';
import {
    listAlerts,
    createAlert,
    generateAlertId,
    type CondicionTipo,
    type Frecuencia
} from '@/lib/alerts';
import { getUserId } from '@/lib/conversations';
import { alertCreateLimiter } from '@/lib/rate-limit';

export async function GET() {
    try {
        const userId = await getUserId();
        const alerts = await listAlerts(userId);
        return NextResponse.json({ alerts });
    } catch (error: any) {
        return NextResponse.json({ error: error.message, alerts: [] }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const userId = await getUserId();
        const limit = alertCreateLimiter.check(`alert:${userId}`);
        if (!limit.allowed) {
            return NextResponse.json({ error: 'Demasiadas alertas creadas, intenta en un momento' }, { status: 429 });
        }

        const body = await req.json();
        const { name, description, sql, conditionType, conditionValue, targetColumn, frequency, active } = body;

        if (!name || !sql || !conditionType) {
            return NextResponse.json({ error: 'name, sql y conditionType son requeridos' }, { status: 400 });
        }

        const id = generateAlertId();
        await createAlert({
            id,
            userId,
            name,
            description: description || null,
            sql,
            conditionType: conditionType as CondicionTipo,
            conditionValue: conditionValue ?? null,
            targetColumn: targetColumn || null,
            frequency: (frequency || 'hourly') as Frecuencia,
            active: active !== false
        });

        return NextResponse.json({ success: true, id });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Error creando alerta' }, { status: 500 });
    }
}
