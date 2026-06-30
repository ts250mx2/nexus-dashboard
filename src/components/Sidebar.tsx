'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    FileText,
    Settings,
    ChevronRight,
    ChevronDown,
    Bot,
    Brain,
    History,
    ShoppingBag,
    TrendingUp,
    DollarSign,
    LayoutGrid,
    Flame,
    Users,
    Layers,
    Package,
    ArrowRightLeft,
    Kanban,
    UserX
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

type SubItem = { name: string; href: string; icon: React.ElementType; color: string };
type SidebarItem = {
    name: string;
    href?: string;
    icon: React.ElementType;
    color: string;
    subItems?: SubItem[];
};

const sidebarItems: SidebarItem[] = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, color: 'text-blue-900' },
    { name: 'Agente IA', href: '/dashboard/reports/ai-agent', icon: Bot, color: 'text-blue-900' },
    {
        name: 'Ventas',
        icon: ShoppingBag,
        color: 'text-blue-900',
        subItems: [
            { name: 'Tendencias de Venta', href: '/dashboard/ventas/tendencias', icon: TrendingUp, color: 'text-blue-900' },
            { name: 'Mapa de Calor', href: '/dashboard/ventas/mapadecalor', icon: Flame, color: 'text-blue-900' },
            { name: 'Categorías Global', href: '/dashboard/ventas/categorias-global', icon: LayoutGrid, color: 'text-blue-900' },
            { name: 'Operaciones', href: '/dashboard/ventas/operaciones', icon: LayoutGrid, color: 'text-blue-900' },
            { name: 'Reporte Ventas', href: '/dashboard/reportes/ventas', icon: FileText, color: 'text-blue-900' },
            { name: 'Profesores Global', href: '/dashboard/ventas/profesores-global', icon: Users, color: 'text-blue-900' },
            { name: 'Productos Global', href: '/dashboard/ventas/productos-global', icon: Package, color: 'text-blue-900' },
            { name: 'Profesores', href: '/dashboard/reportes/profesores', icon: FileText, color: 'text-blue-900' },
            { name: 'Profesores Última Venta', href: '/dashboard/ventas/profesores-ultima-venta', icon: UserX, color: 'text-blue-900' },
            { name: 'Margen & Rentabilidad', href: '/dashboard/reportes/margen', icon: DollarSign, color: 'text-blue-900' },
            { name: 'Retiros', href: '/dashboard/ventas/retiros', icon: DollarSign, color: 'text-blue-900' }
        ]
    },
    {
        name: 'Compras',
        icon: ShoppingBag,
        color: 'text-blue-900',
        subItems: [
            { name: 'Compras Global', href: '/dashboard/compras/global', icon: LayoutGrid, color: 'text-blue-900' },
            { name: 'Órdenes de Compra', href: '/dashboard/compras/ordenes', icon: FileText, color: 'text-blue-900' },
            { name: 'Traspasos', href: '/dashboard/compras/traspasos', icon: ArrowRightLeft, color: 'text-blue-900' },
            { name: 'Kanban de Traspasos', href: '/dashboard/compras/traspasos/kanban', icon: Kanban, color: 'text-blue-900' }
        ]
    },
    {
        name: 'Inventarios',
        icon: Layers,
        color: 'text-blue-900',
        subItems: [
            { name: 'Costo de Inventario', href: '/dashboard/inventarios/costo', icon: DollarSign, color: 'text-blue-900' }
        ]
    },
    {
        name: 'Configuración',
        icon: Settings,
        color: 'text-blue-900',
        subItems: [
            { name: 'Diseñador de Consultas', href: '/dashboard/settings/query-designer', icon: LayoutGrid, color: 'text-blue-900' },
            { name: 'Aprendizaje IA', href: '/dashboard/settings/ai-learning', icon: Brain, color: 'text-blue-900' },
            { name: 'Historial de Preguntas', href: '/dashboard/settings/ai-history', icon: History, color: 'text-blue-900' }
        ]
    },
];

interface SidebarProps {
    isCollapsed: boolean;
    setIsCollapsed: (collapsed: boolean) => void;
    isMobileOpen: boolean;
    setIsMobileOpen: (open: boolean) => void;
}

export default function Sidebar({ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen }: SidebarProps) {
    const pathname = usePathname();
    const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
        'Ventas': pathname.includes('/ventas') || pathname.includes('/reportes'),
        'Compras': pathname.includes('/compras'),
        'Inventarios': pathname.includes('/inventarios'),
        'Configuración': pathname.includes('/settings'),
    });

    const toggleExpanded = (name: string) => {
        if (isCollapsed) setIsCollapsed(false);
        setExpandedMenus(prev => ({ ...prev, [name]: !prev[name] }));
    };

    useEffect(() => {
        if (isCollapsed) {
            setExpandedMenus({});
        } else {
            setExpandedMenus({
                'Ventas': pathname.includes('/ventas') || pathname.includes('/reportes'),
                'Compras': pathname.includes('/compras'),
                'Inventarios': pathname.includes('/inventarios'),
                'Configuración': pathname.includes('/settings'),
            });
        }
    }, [isCollapsed, pathname]);

    return (
        <>
            <aside className={cn(
                "fixed left-0 top-16 h-[calc(100vh-4rem)] bg-[#F1F5F9] text-slate-800 transition-all duration-300 z-20 flex flex-col border-r border-slate-200/60 shadow-xs",
                isCollapsed ? "w-20" : "w-64",
                isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            )}>
                {/* Navigation Menu */}
                <nav className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto overflow-x-hidden">
                    {sidebarItems.map((item) => {
                        const hasSubItems = item.subItems && item.subItems.length > 0;
                        const isExpanded = expandedMenus[item.name];
                        const isActive = !hasSubItems && pathname === item.href;
                        const hasActiveChild = hasSubItems && item.subItems!.some(sub => pathname === sub.href);

                        return (
                            <div key={item.name} className="flex flex-col">
                                {hasSubItems ? (
                                    <button
                                        onClick={() => toggleExpanded(item.name)}
                                        className={cn(
                                            "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group w-full text-left cursor-pointer",
                                            hasActiveChild
                                                ? "bg-white text-blue-900 font-bold border-l-2 border-blue-900 shadow-xs"
                                                : "text-slate-600 font-semibold hover:bg-slate-200/50 hover:text-slate-900"
                                        )}
                                    >
                                        <item.icon size={18} className={cn(hasActiveChild ? "text-blue-900" : "text-slate-400 group-hover:text-slate-600", "shrink-0 transition-transform duration-200 group-hover:scale-105")} />
                                        {!isCollapsed && <span className="text-sm flex-1 truncate">{item.name}</span>}
                                        {!isCollapsed && (
                                            isExpanded ? <ChevronDown size={14} className="shrink-0 text-slate-400" /> : <ChevronRight size={14} className="shrink-0 text-slate-400" />
                                        )}
                                    </button>
                                ) : (
                                    <Link
                                        href={item.href!}
                                        className={cn(
                                            "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group",
                                            isActive
                                                ? "bg-white text-blue-900 font-bold border-l-2 border-blue-900 shadow-xs"
                                                : "text-slate-600 font-semibold hover:bg-slate-200/50 hover:text-slate-900"
                                        )}
                                        title={isCollapsed ? item.name : undefined}
                                    >
                                        <item.icon size={18} className={cn(isActive ? "text-blue-900" : "text-slate-400 group-hover:text-slate-600", "shrink-0 transition-transform duration-200 group-hover:scale-105")} />
                                        {!isCollapsed && <span className="text-sm truncate">{item.name}</span>}
                                    </Link>
                                )}

                                {/* SubItems Section */}
                                {hasSubItems && !isCollapsed && isExpanded && (
                                    <div className="ml-5 mt-1.5 flex flex-col gap-1 border-l border-slate-200/60 pl-3.5">
                                        {item.subItems!.map((sub) => {
                                            const isSubActive = pathname === sub.href;
                                            return (
                                                <Link
                                                    key={sub.name}
                                                    href={sub.href}
                                                    className={cn(
                                                        "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 text-xs group",
                                                        isSubActive
                                                            ? "bg-white text-blue-900 font-bold border-l-2 border-blue-900 shadow-xs"
                                                            : "text-slate-600 font-medium hover:text-slate-900 hover:bg-slate-200/40"
                                                    )}
                                                >
                                                    <sub.icon size={14} className={cn(isSubActive ? "text-blue-900" : "text-slate-400 group-hover:text-slate-600", "shrink-0")} />
                                                    <span className="truncate">{sub.name}</span>
                                                </Link>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </nav>

                {/* Footer Collapse Toggle at the Bottom */}
                <div className="p-3 border-t border-slate-200 bg-slate-200/20">
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className={cn(
                            "flex items-center gap-3 w-full px-3 py-2.5 text-slate-450 hover:text-blue-900 hover:bg-slate-200/50 rounded-lg transition-all duration-150 cursor-pointer text-xs font-bold uppercase tracking-wider",
                            isCollapsed ? "justify-center" : "justify-between"
                        )}
                        title={isCollapsed ? "Expandir menú" : "Contraer menú"}
                    >
                        <div className="flex items-center gap-3">
                            <ChevronRight size={16} className={cn("transition-transform duration-200", !isCollapsed && "rotate-180")} />
                            {!isCollapsed && <span>Ocultar menú</span>}
                        </div>
                    </button>
                </div>
            </aside>
        </>
    );
}
