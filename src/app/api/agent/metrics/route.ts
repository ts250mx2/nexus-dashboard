import { NextResponse } from 'next/server';
import { getMetricsSummary } from '@/lib/metrics';

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const hours = Math.min(168, Math.max(1, parseInt(url.searchParams.get('hours') || '24', 10)));
        const summary = await getMetricsSummary(hours);
        return NextResponse.json(summary);
    } catch (error: any) {
        console.error('getMetrics error:', error);
        return NextResponse.json(
            { error: error.message || 'Error obteniendo métricas' },
            { status: 500 }
        );
    }
}
