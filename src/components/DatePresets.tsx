'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

type DatePreset = 'Hoy' | 'Ayer' | 'Semana' | '7 Dias' | 'Mes' | 'Mes Pasado';

export default function DatePresets() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const formatDate = (date: Date) => {
        const d = new Date(date);
        let month = '' + (d.getMonth() + 1);
        let day = '' + d.getDate();
        const year = d.getFullYear();

        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;

        return [year, month, day].join('-');
    };

    const handlePresetClick = (preset: DatePreset) => {
        const now = new Date();
        let start = new Date();
        let end = new Date();

        switch (preset) {
            case 'Hoy':
                // Already set to today
                break;
            case 'Ayer':
                start.setDate(now.getDate() - 1);
                end.setDate(now.getDate() - 1);
                break;
            case 'Semana':
                // Monday of current week
                const day = now.getDay();
                const diff = now.getDate() - day + (day === 0 ? -6 : 1);
                start.setDate(diff);
                break;
            case '7 Dias':
                start.setDate(now.getDate() - 6);
                break;
            case 'Mes':
                start.setDate(1);
                break;
            case 'Mes Pasado':
                start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                end = new Date(now.getFullYear(), now.getMonth(), 0);
                break;
        }

        const params = new URLSearchParams(searchParams.toString());
        params.set('startDate', formatDate(start));
        params.set('endDate', formatDate(end));
        router.push(`?${params.toString()}`, { scroll: false });
    };

    const presets: DatePreset[] = ['Hoy', 'Ayer', 'Semana', '7 Dias', 'Mes', 'Mes Pasado'];

    return (
        <div className="flex flex-wrap items-center gap-2">
            {presets.map((preset) => (
                <button
                    key={preset}
                    onClick={() => handlePresetClick(preset)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-50 text-slate-600 border border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all active:scale-95"
                >
                    {preset}
                </button>
            ))}
        </div>
    );
}
