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
        <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase">Del:</span>
            <input
                type="date"
                value={startDate}
                onChange={(e) => handleDateChange('start', e.target.value)}
                className="text-sm font-medium text-slate-600 bg-transparent border-none p-0 focus:ring-0 cursor-pointer outline-none"
            />
            <span className="text-xs font-semibold text-slate-500 uppercase ml-2">Al:</span>
            <input
                type="date"
                value={endDate}
                onChange={(e) => handleDateChange('end', e.target.value)}
                className="text-sm font-medium text-slate-600 bg-transparent border-none p-0 focus:ring-0 cursor-pointer outline-none"
            />
        </div>
    );
}
