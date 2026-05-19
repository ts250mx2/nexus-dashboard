/**
 * Evalúa todas las alertas activas del usuario en un solo barrido.
 * Pensado para llamarse desde un cron externo o desde el dashboard.
 */

import { NextResponse } from 'next/server';
import {
    listAlerts,
    evaluateCondition,
    recordAlertEvent
} from '@/lib/alerts';
import { assertReadOnly } from '@/lib/sql-sandbox';
import { getUserId } from '@/lib/conversations';
import { query } from '@/lib/db';
import { cronLimiter } from '@/lib/rate-limit';

export async function POST() {
    try {
        const userId = await getUserId();
        const limit = cronLimiter.check(`eval:${userId}`);
        if (!limit.allowed) {
            return NextResponse.json({ error: 'Evaluación reciente en curso' }, { status: 429 });
        }

        const alerts = await listAlerts(userId);
        const results: Array<{ id: string; name: string; triggered: boolean; value: number | null; error?: string }> = [];

        for (const a of alerts) {
            if (!a.active) continue;
            try {
                const safeSql = assertReadOnly(a.sql);
                const rows = await query(safeSql);
                const evalRes = evaluateCondition(rows, a.conditionType, a.conditionValue, a.targetColumn);

                if (evalRes.triggered) {
                    const msg = `${a.name}: valor observado ${evalRes.observedValue} (umbral ${a.conditionType} ${a.conditionValue ?? 'N/A'})`;
                    await recordAlertEvent({
                        alertId: a.id,
                        userId: a.userId,
                        observedValue: evalRes.observedValue,
                        message: msg,
                        resultsJson: JSON.stringify(rows.slice(0, 10))
                    });
                }
                results.push({ id: a.id, name: a.name, triggered: evalRes.triggered, value: evalRes.observedValue });
            } catch (e: any) {
                results.push({ id: a.id, name: a.name, triggered: false, value: null, error: e?.message });
            }
        }

        return NextResponse.json({ evaluated: results.length, results });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
