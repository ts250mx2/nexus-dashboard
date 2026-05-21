'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function DateSelector({ defaultStartDate, defaultEndDate }: { defaultStartDate: string, defaultEndDate: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // We use the URL query if present, otherwise default to the server-calculated one
    const startDate = searchParams.get('startDate') || defaultStartDate;
    const endDate = searchParams.get('endDate') || defaultEndDate;

    const handleDateChange = (type: 'start' | 'end', value: string) => {
        const params = new URLSearchParams(searchParams.toString());

        if (value) {
            params.set(type === 'start' ? 'startDate' : 'endDate', value);
        } else {
            params.delete(type === 'start' ? 'startDate' : 'endDate');
        }

        // Navigate without scrolling back to top, keeping the user in place
        router.push(`?${params.toString()}`, { scroll: false });
    };

    return (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:border-slate-300 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all shadow-xs">
                <span className="text-[9px] font-extrabold text-slate-400 tracking-wider uppercase">DEL</span>
                <input
                    type="date"
                    value={startDate}
                    onChange={(e) => handleDateChange('start', e.target.value)}
                    className="text-xs font-bold text-slate-700 bg-transparent border-none p-0 focus:ring-0 cursor-pointer outline-none"
                />
            </div>
            <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:border-slate-300 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all shadow-xs">
                <span className="text-[9px] font-extrabold text-slate-400 tracking-wider uppercase">AL</span>
                <input
                    type="date"
                    value={endDate}
                    onChange={(e) => handleDateChange('end', e.target.value)}
                    className="text-xs font-bold text-slate-700 bg-transparent border-none p-0 focus:ring-0 cursor-pointer outline-none"
                />
            </div>
        </div>
    );
}
