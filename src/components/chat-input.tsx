'use client';

import { useState, useEffect } from 'react';
import { Send, Loader2, Mic, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVoiceRecognition } from '@/hooks/use-voice-recognition';

interface ChatInputProps {
    onSend: (message: string) => void;
    isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
    const [input, setInput] = useState('');
    const { isListening, transcript, startListening, stopListening, error } = useVoiceRecognition();

    useEffect(() => {
        if (transcript) {
            setInput(transcript);
        }
    }, [transcript]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            onSend(input);
            setInput('');
            if (isListening) stopListening();
        }
    };

    const toggleListening = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };

    return (
        <div className="flex flex-col gap-2 w-full max-w-4xl mx-auto px-2">
            {error && (
                <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest px-4">{error}</p>
            )}
            <form onSubmit={handleSubmit} className="flex-1 flex gap-3 items-end">
                <div className="relative flex-1">
                    <textarea
                        rows={1}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e);
                            }
                        }}
                        placeholder={isListening ? "Escuchando..." : "Hazme una consulta analítica..."}
                        className={cn(
                            "w-full px-6 py-4 text-[15px] bg-white border border-slate-200 rounded-[24px] shadow-sm",
                            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
                            "placeholder:text-slate-400 text-slate-700 transition-all duration-300",
                            "resize-none min-h-[56px] max-h-[150px] overflow-y-auto font-medium",
                            (isLoading || isListening) && "border-blue-500",
                            isLoading && "opacity-50 cursor-not-allowed"
                        )}
                        disabled={isLoading}
                    />
                    {isListening && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                            <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" />
                        </div>
                    )}
                </div>

                <div className="flex gap-2 mb-0.5">
                    <button
                        type="button"
                        onClick={toggleListening}
                        disabled={isLoading}
                        className={cn(
                            "p-4 h-14 w-14 flex items-center justify-center rounded-[20px] transition-all duration-300",
                            isListening
                                ? "bg-red-500 text-white shadow-lg shadow-red-100 animate-pulse"
                                : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                            "disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 flex-shrink-0"
                        )}
                    >
                        {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                    </button>

                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className={cn(
                            "p-4 h-14 w-14 flex items-center justify-center rounded-[20px] bg-blue-600 text-white",
                            "hover:bg-blue-700 hover:shadow-lg transition-all duration-300 shadow-blue-100",
                            "disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 flex-shrink-0"
                        )}
                    >
                        {isLoading ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <Send className="w-6 h-6" />
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
