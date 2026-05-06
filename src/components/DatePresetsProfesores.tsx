'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

type DatePreset = '1 Mes' | '3 Meses' | '6 Meses' | '1 Año' | '2 Años';

export default function DatePresetsProfesores() {
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
            case '1 Mes':
                start.setMonth(now.getMonth() - 1);
                start.setDate(1);
                break;
            case '3 Meses':
                start.setMonth(now.getMonth() - 3);
                start.setDate(1);
                break;
            case '6 Meses':
                start.setMonth(now.getMonth() - 6);
                start.setDate(1);
                break;
            case '1 Año':
                start.setFullYear(now.getFullYear() - 1);
                start.setDate(1);
                break;
            case '2 Años':
                start.setFullYear(now.getFullYear() - 2);
                start.setDate(1);
                break;
        }

        const params = new URLSearchParams(searchParams.toString());
        params.set('startDate', formatDate(start));
        params.set('endDate', formatDate(end));
        router.push(`?${params.toString()}`, { scroll: false });
    };

    const presets: DatePreset[] = ['1 Mes', '3 Meses', '6 Meses', '1 Año', '2 Años'];

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
