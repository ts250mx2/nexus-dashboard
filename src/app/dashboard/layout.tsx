'use client';

import Sidebar from '@/components/Sidebar';
import { FloatingChatAgent } from '@/components/floating-chat-agent';
import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Bell, Search, LogOut, Menu, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

const segmentMap: Record<string, string> = {
    dashboard: 'Dashboard',
    ventas: 'Ventas',
    compras: 'Compras',
    reportes: 'Reportes',
    settings: 'Configuración',
    'profesores-global': 'Profesores Global',
    'productos-global': 'Productos Global',
    'mapadecalor': 'Mapa de Calor',
    'categorias-global': 'Categorías Global',
    'operaciones': 'Operaciones',
    'tendencias': 'Tendencias de Venta',
    'retiros': 'Retiros',
    'ordenes': 'Órdenes de Compra',
    'traspasos': 'Traspasos',
    'kanban': 'Kanban',
    'query-designer': 'Diseñador de Consultas',
    'ai-learning': 'Aprendizaje IA',
    'ai-history': 'Historial de Preguntas',
    'ai-agent': 'Agente IA',
    'profesores': 'Reporte Profesores',
    'profesores-ultima-venta': 'Profesores Última Venta',
    'margen': 'Margen & Rentabilidad'
};

const searchItems = [
    { name: 'Dashboard Principal', href: '/dashboard', category: 'General' },
    { name: 'Agente de Inteligencia Artificial', href: '/dashboard/reports/ai-agent', category: 'IA' },
    { name: 'Tendencias de Venta', href: '/dashboard/ventas/tendencias', category: 'Ventas' },
    { name: 'Mapa de Calor de Ventas', href: '/dashboard/ventas/mapadecalor', category: 'Ventas' },
    { name: 'Categorías Global', href: '/dashboard/ventas/categorias-global', category: 'Ventas' },
    { name: 'Operaciones del Día', href: '/dashboard/ventas/operaciones', category: 'Ventas' },
    { name: 'Reporte Ventas', href: '/dashboard/reportes/ventas', category: 'Ventas' },
    { name: 'Profesores Global', href: '/dashboard/ventas/profesores-global', category: 'Ventas' },
    { name: 'Productos Global', href: '/dashboard/ventas/productos-global', category: 'Ventas' },
    { name: 'Reporte Profesores', href: '/dashboard/reportes/profesores', category: 'Reportes' },
    { name: 'Profesores Última Venta', href: '/dashboard/ventas/profesores-ultima-venta', category: 'Ventas' },
    { name: 'Margen & Rentabilidad', href: '/dashboard/reportes/margen', category: 'Reportes' },
    { name: 'Retiros de Caja', href: '/dashboard/ventas/retiros', category: 'Ventas' },
    { name: 'Órdenes de Compra', href: '/dashboard/compras/ordenes', category: 'Compras' },
    { name: 'Traspasos entre Sucursales', href: '/dashboard/compras/traspasos', category: 'Compras' },
    { name: 'Kanban de Traspasos', href: '/dashboard/compras/traspasos/kanban', category: 'Compras' },
    { name: 'Diseñador de Consultas', href: '/dashboard/settings/query-designer', category: 'Configuración' },
    { name: 'Aprendizaje IA', href: '/dashboard/settings/ai-learning', category: 'Configuración' },
    { name: 'Historial de Preguntas IA', href: '/dashboard/settings/ai-history', category: 'Configuración' }
];

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    
    const pathname = usePathname();
    const router = useRouter();
    const paths = pathname?.split('/').filter(Boolean) || [];

    const filteredItems = useMemo(() => {
        if (!searchQuery) return [];
        return searchItems.filter(item => 
            item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.category.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [searchQuery]);

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex flex-col relative overflow-hidden">
            {/* Header at the very top, full width, using a beautiful, soft slate blue-grey background matching the logo */}
            <header className="h-16 border-b border-slate-200/80 bg-[#F1F5F9] fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-6 shadow-xs select-none">
                <div className="flex items-center gap-4">
                    {/* Mobile Hamburger Toggle */}
                    <button
                        className="lg:hidden p-2 text-slate-700 hover:bg-slate-200/50 rounded-xl transition-all duration-200 cursor-pointer"
                        onClick={() => setIsMobileOpen(!isMobileOpen)}
                    >
                        {isMobileOpen ? <X size={18} /> : <Menu size={18} />}
                    </button>

                    {/* Borderless and background-free brand logo */}
                    <Link href="/dashboard" className="flex items-center justify-center shrink-0">
                        <img
                            src="/logo.webp"
                            alt="Nexus Logo"
                            className="object-contain w-auto h-9 max-h-[36px] transition-transform duration-200 hover:scale-[1.02]"
                        />
                    </Link>

                    {/* Elegant Divider */}
                    <div className="w-px h-6 bg-slate-300/80 hidden md:block mx-2"></div>

                    {/* Dynamic Breadcrumbs */}
                    <div className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                        <span>Plataforma</span>
                        {paths.map((path, idx) => {
                            if (path === 'dashboard' && paths.length > 1) return null;
                            const title = segmentMap[path] || path.charAt(0).toUpperCase() + path.slice(1);
                            return (
                                <React.Fragment key={path}>
                                    <span className="text-slate-300">/</span>
                                    <span className={cn(
                                        idx === paths.length - 1 ? "text-slate-800 font-bold" : "text-slate-400 font-medium"
                                    )}>
                                        {title}
                                    </span>
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Live Search Input */}
                    <div className="relative">
                        <div className="hidden md:flex items-center gap-2 bg-white border border-slate-250 px-3 py-1.5 rounded-lg text-slate-400 w-64 focus-within:border-blue-900 focus-within:ring-1 focus-within:ring-blue-900 transition-all shadow-xs">
                            <Search size={14} className="text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar en la plataforma..."
                                className="bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-none w-full font-semibold"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => setIsSearchFocused(true)}
                                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                            />
                        </div>

                        {/* Live Search Results Dropdown */}
                        {isSearchFocused && searchQuery && (
                            <div className="absolute top-11 right-0 w-80 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                                {filteredItems.length > 0 ? (
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 select-none">Páginas Encontradas</p>
                                        {filteredItems.map(item => (
                                            <button
                                                key={item.href}
                                                onClick={() => {
                                                    router.push(item.href);
                                                    setSearchQuery('');
                                                }}
                                                className="flex items-center justify-between w-full text-left px-2.5 py-2 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                                            >
                                                <span className="text-blue-950 font-bold">{item.name}</span>
                                                <span className="text-[9px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded uppercase">{item.category}</span>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-4 text-xs text-slate-400 font-medium select-none">No se encontraron resultados</div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Notification Bell */}
                    <button className="p-2 hover:bg-slate-200/50 text-slate-400 hover:text-slate-600 rounded-lg border border-slate-200/60 transition-all relative cursor-pointer bg-white">
                        <Bell size={16} />
                        <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
                    </button>

                    <div className="w-px h-5 bg-slate-300"></div>

                    {/* User Profile */}
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-800 to-indigo-900 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                            A
                        </div>
                        <div className="hidden sm:flex flex-col text-left mr-2">
                            <span className="text-xs font-bold text-slate-700">Admin User</span>
                            <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Administrador</span>
                        </div>
                    </div>

                    <div className="w-px h-5 bg-slate-300 hidden sm:block"></div>

                    {/* Cerrar Sesión (Logout) */}
                    <button
                        onClick={() => {
                            window.location.href = '/login';
                        }}
                        className="flex items-center gap-2 p-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg border border-slate-200 hover:border-red-200 transition-all cursor-pointer bg-white"
                        title="Cerrar Sesión"
                    >
                        <LogOut size={14} />
                        <span className="hidden sm:inline">Cerrar Sesión</span>
                    </button>
                </div>
            </header>

            {/* Sidebar + Main content container underneath the header */}
            <div className="flex flex-1 pt-16 min-h-screen">
                <Sidebar 
                    isCollapsed={isCollapsed} 
                    setIsCollapsed={setIsCollapsed} 
                    isMobileOpen={isMobileOpen} 
                    setIsMobileOpen={setIsMobileOpen} 
                />

                <div className={cn(
                    "flex-1 flex flex-col min-h-[calc(100vh-4rem)] transition-all duration-300",
                    isCollapsed ? "lg:ml-20" : "lg:ml-64"
                )}>
                    <main className="flex-1 p-4 lg:p-8 relative z-10">
                        <div className="max-w-7xl mx-auto">
                            {children}
                        </div>
                        <FloatingChatAgent />
                    </main>
                </div>
            </div>
        </div>
    );
}
