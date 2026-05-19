'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MultiSelectProps {
    options: { id: string | number; name: string }[];
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder?: string;
    searchable?: boolean;
}

export default function MultiSelect({ 
    options, 
    selected, 
    onChange, 
    placeholder = "Seleccionar...",
    searchable = false
}: MultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchTerm('');
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

    // Filter options in real-time if searchable is active
    const filteredOptions = searchable
        ? options.filter(opt => 
            opt.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
            String(opt.id).toLowerCase().includes(searchTerm.toLowerCase())
          )
        : options;

    const toggleAll = () => {
        const filteredIds = filteredOptions.map(opt => String(opt.id));
        const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selected.includes(id));

        if (allFilteredSelected) {
            // Unselect only the filtered ones
            onChange(selected.filter(id => !filteredIds.includes(id)));
        } else {
            // Select all filtered ones
            onChange([...new Set([...selected, ...filteredIds])]);
        }
    };

    const isAllSelected = searchable
        ? filteredOptions.length > 0 && filteredOptions.every(opt => selected.includes(String(opt.id)))
        : options.length > 0 && selected.length === options.length;

    const selectedNames = options
        .filter(opt => selected.includes(String(opt.id)))
        .map(opt => opt.name);

    return (
        <div className="relative w-full" ref={containerRef}>
            <div
                onClick={() => {
                    setIsOpen(!isOpen);
                    if (isOpen) setSearchTerm('');
                }}
                className={cn(
                    "flex items-center justify-between px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 cursor-pointer hover:border-blue-500/50 transition-all",
                    isOpen && "ring-2 ring-blue-500/20 border-blue-500"
                )}
            >
                <div className="flex-1 truncate mr-2">
                    {selected.length === 0 ? (
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-tight">{placeholder}</span>
                    ) : selected.length === options.length ? (
                        <span className="text-blue-600 font-black text-xs uppercase tracking-tight">Selección Completa</span>
                    ) : (
                        <span className="text-slate-700 text-xs font-black uppercase tracking-tight">{selectedNames.join(', ')}</span>
                    )}
                </div>
                <ChevronDown className={cn("text-slate-400 transition-transform", isOpen && "rotate-180")} size={16} />
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-2 animate-in fade-in zoom-in-95 duration-100 max-h-64 overflow-y-auto">
                    {/* Search Field */}
                    {searchable && (
                        <div className="px-3 pb-2 pt-1 border-b border-slate-100 mb-1 sticky top-0 bg-white z-10">
                            <div className="relative">
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre o código..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all"
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Toggle All Button */}
                    {filteredOptions.length > 0 && (
                        <div
                            onClick={toggleAll}
                            className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-100 mb-1"
                        >
                            <div className={cn(
                                "w-4 h-4 rounded border flex items-center justify-center transition-all",
                                isAllSelected ? "bg-blue-600 border-blue-600" : "border-slate-300 bg-white"
                            )}>
                                {isAllSelected && <Check size={12} className="text-white" />}
                            </div>
                            <span className="font-bold text-slate-700 text-xs uppercase tracking-tight">
                                {isAllSelected ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                            </span>
                        </div>
                    )}

                    {/* Filtered Options List */}
                    {filteredOptions.length === 0 ? (
                        <div className="px-4 py-3 text-center text-xs font-bold text-slate-400 uppercase tracking-tight">
                            Sin resultados
                        </div>
                    ) : (
                        filteredOptions.map((option) => (
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
                                <span className="text-slate-600 text-xs font-black uppercase tracking-tight leading-tight">{option.name}</span>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
