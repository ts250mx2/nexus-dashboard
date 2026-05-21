'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, User, Lock, Loader2 } from 'lucide-react';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            if (res.ok) {
                router.push('/dashboard');
            } else {
                const data = await res.json();
                setError(data.message || 'Error al iniciar sesión');
            }
        } catch (err) {
            setError('Error de conexión con el servidor');
        } finally {
            setIsLoading(false);
        }
    };
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-4 relative">
            <div className="w-full max-w-md bg-white border border-slate-200/60 rounded-2xl shadow-xl overflow-hidden relative z-10 hover-premium transition-all duration-300">
                <div className="p-8">
                    <div className="flex flex-col items-center mb-8 select-none">
                        <div className="relative w-48 h-20 mb-6 flex items-center justify-center">
                            <div className="flex bg-slate-50 border border-slate-100 shadow-xs rounded-2xl p-2.5 items-center justify-center shrink-0 w-full h-full hover:scale-[1.02] transition-transform duration-300">
                                <img
                                    src="/logo.webp"
                                    alt="Nexus Logo"
                                    className="object-contain w-auto h-full max-h-[50px]"
                                />
                            </div>
                        </div>
                        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Plataforma Nexus</h1>
                        <p className="text-xs text-slate-500 font-semibold tracking-wide mt-1.5 text-center">Ingresa tus credenciales para acceder</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="relative">
                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2 block">Usuario</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                    <User className="h-4 w-4 text-slate-400" />
                                </div>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="block w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 sm:text-sm font-semibold transition-all hover:border-slate-300"
                                    placeholder="usuario"
                                    required
                                />
                            </div>
                        </div>

                        <div className="relative">
                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2 block">Contraseña</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                    <Lock className="h-4 w-4 text-slate-400" />
                                </div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 sm:text-sm font-semibold transition-all hover:border-slate-300"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-50 border-l-4 border-red-500 p-4 text-xs font-bold text-red-700 uppercase tracking-wider rounded-r-lg">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`w-full flex justify-center py-3.5 px-4 border border-transparent rounded-lg shadow-sm text-xs font-bold uppercase tracking-wider text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-all cursor-pointer active:scale-95 ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                'Iniciar Sesión'
                            )}
                        </button>
                    </form>
                </div>
                <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center relative z-10">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">© 2026 Nexus Superior Equipment</span>
                    <div className="flex space-x-2.5">
                        <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-sm animate-pulse"></div>
                        <div className="w-2 h-2 rounded-full bg-slate-300 shadow-sm animate-pulse"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
