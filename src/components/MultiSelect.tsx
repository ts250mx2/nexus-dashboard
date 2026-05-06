'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MultiSelectProps {
    options: { id: string | number; name: string }[];
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder?: string;
}

export default function MultiSelect({ options, selected, onChange, placeholder = "Seleccionar..." }: MultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (id: string) => {
        const newSelected = selected.includes(id)
            ? selected.filter(item => item !== id)
            : [...selected, id];
        onChange(newSelected);
    };

    const toggleAll = () => {
        if (selected.length === options.length) {
            onChange([]);
        } else {
            onChange(options.map(opt => String(opt.id)));
        }
    };

    const selectedNames = options
        .filter(opt => selected.includes(String(opt.id)))
        .map(opt => opt.name);

    return (
        <div className="relative w-full" ref={containerRef}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center justify-between px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 cursor-pointer hover:border-blue-500/50 transition-all",
                    isOpen && "ring-2 ring-blue-500/20 border-blue-500"
                )}
            >
                <div className="flex-1 truncate mr-2">
                    {selected.length === 0 ? (
                        <span className="text-slate-400">{placeholder}</span>
                    ) : selected.length === options.length ? (
                        <span className="text-blue-600 font-bold">Todas las sucursales</span>
                    ) : (
                        <span className="text-slate-700">{selectedNames.join(', ')}</span>
                    )}
                </div>
                <ChevronDown className={cn("text-slate-400 transition-transform", isOpen && "rotate-180")} size={16} />
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-2 animate-in fade-in zoom-in-95 duration-100 max-h-64 overflow-y-auto">
                    <div
                        onClick={toggleAll}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-100 mb-1"
                    >
                        <div className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center transition-all",
                            selected.length === options.length ? "bg-blue-600 border-blue-600" : "border-slate-300 bg-white"
                        )}>
                            {selected.length === options.length && <Check size={12} className="text-white" />}
                        </div>
                        <span className="font-bold text-slate-700 text-sm">Seleccionar Todas</span>
                    </div>
                    {options.map((option) => (
                        <div
                            key={option.id}
                            onClick={() => toggleOption(String(option.id))}
                            className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                            <div className={cn(
                                "w-4 h-4 rounded border flex items-center justify-center transition-all",
                                selected.includes(String(option.id)) ? "bg-blue-600 border-blue-600" : "border-slate-300 bg-white"
                            )}>
                                {selected.includes(String(option.id)) && <Check size={12} className="text-white" />}
                            </div>
                            <span className="text-slate-600 text-sm">{option.name}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
