'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    FileText,
    Settings,
    LogOut,
    Menu,
    X,
    ChevronRight,
    ChevronDown,
    CircleUser,
    Bot,
    Brain,
    History
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

type SubItem = { name: string; href: string; icon: React.ElementType };
type SidebarItem = {
    name: string;
    href?: string;
    icon: React.ElementType;
    subItems?: SubItem[];
};

const sidebarItems: SidebarItem[] = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    {
        name: 'Reportes',
        icon: FileText,
        subItems: [
            { name: 'Agente IA', href: '/dashboard/reports/ai-agent', icon: Bot }
        ]
    },
    {
        name: 'Configuración',
        icon: Settings,
        subItems: [
            { name: 'Aprendizaje IA', href: '/dashboard/settings/ai-learning', icon: Brain },
            { name: 'Historial de Preguntas', href: '/dashboard/settings/ai-history', icon: History }
        ]
    },
];

export default function Sidebar() {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(true);
    const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
        'Reportes': pathname.includes('/reports'),
        'Configuración': pathname.includes('/settings'),
    });

    const toggleExpanded = (name: string) => {
        if (!isOpen) setIsOpen(true);
        setExpandedMenus(prev => ({ ...prev, [name]: !prev[name] }));
    };

    useEffect(() => {
        if (!isOpen) {
            setExpandedMenus({});
        } else {
            setExpandedMenus({
                'Reportes': pathname.includes('/reports'),
                'Configuración': pathname.includes('/settings'),
            });
        }
    }, [isOpen, pathname]);

    return (
        <>
            <button
                className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-blue-600 text-white rounded-md"
                onClick={() => setIsOpen(!isOpen)}
            >
                {isOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <aside className={cn(
                "fixed left-0 top-0 h-full bg-slate-900 text-white transition-all duration-300 z-40 flex flex-col border-r border-slate-800",
                isOpen ? "w-64" : "w-20",
                !isOpen && "hidden lg:flex"
            )}>
                <div className="p-6 flex items-center gap-3 border-b border-slate-800 h-28">
                    <div className="flex bg-white rounded p-2 items-center justify-center shrink-0 w-full h-full">
                        <img
                            src="/logo.webp"
                            alt="Nexus Logo"
                            className="object-contain transition-all duration-300 w-auto h-full max-h-[70px]"
                            style={{ maxWidth: isOpen ? '280px' : '60px' }}
                        />
                    </div>
                </div>

                <nav className="flex-1 py-6 px-3 space-y-2 overflow-y-auto overflow-x-hidden">
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
                                            "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group w-full text-left",
                                            hasActiveChild
                                                ? "bg-slate-800 text-blue-400"
                                                : "text-slate-400 hover:bg-slate-800 hover:text-white"
                                        )}
                                    >
                                        <item.icon size={20} className={cn(hasActiveChild ? "text-blue-400" : "text-slate-400 group-hover:text-blue-400", "shrink-0")} />
                                        {isOpen && <span className="font-medium flex-1 truncate">{item.name}</span>}
                                        {isOpen && (
                                            isExpanded ? <ChevronDown size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0" />
                                        )}
                                    </button>
                                ) : (
                                    <Link
                                        href={item.href!}
                                        className={cn(
                                            "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group",
                                            isActive
                                                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                                                : "text-slate-400 hover:bg-slate-800 hover:text-white"
                                        )}
                                        title={!isOpen ? item.name : undefined}
                                    >
                                        <item.icon size={20} className={cn(isActive ? "text-white" : "text-slate-400 group-hover:text-blue-400", "shrink-0")} />
                                        {isOpen && <span className="font-medium truncate">{item.name}</span>}
                                    </Link>
                                )}

                                {/* Render SubItems if expanded */}
                                {hasSubItems && isOpen && isExpanded && (
                                    <div className="ml-9 mt-1 flex flex-col gap-1 border-l border-slate-700 pl-2">
                                        {item.subItems!.map((sub) => {
                                            const isSubActive = pathname === sub.href;
                                            return (
                                                <Link
                                                    key={sub.name}
                                                    href={sub.href}
                                                    className={cn(
                                                        "flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 text-sm group",
                                                        isSubActive
                                                            ? "bg-blue-600 text-white shadow-sm"
                                                            : "text-slate-400 hover:text-white hover:bg-slate-800"
                                                    )}
                                                >
                                                    <sub.icon size={16} className={cn(isSubActive ? "text-white" : "text-slate-500 group-hover:text-blue-400", "shrink-0")} />
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

                <div className="p-4 border-t border-slate-800">
                    <div className={cn(
                        "flex items-center gap-3 p-2 rounded-xl bg-slate-800/50 mb-4",
                        isOpen ? "px-3" : "justify-center"
                    )}>
                        <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shrink-0">
                            <CircleUser size={20} />
                        </div>
                        {isOpen && (
                            <div className="overflow-hidden">
                                <p className="text-sm font-medium truncate">Admin User</p>
                                <p className="text-xs text-slate-500 truncate">admin@nexusmty.com</p>
                            </div>
                        )}
                    </div>

                    <button className={cn(
                        "flex items-center gap-3 w-full px-3 py-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all",
                        !isOpen && "justify-center"
                    )}>
                        <LogOut size={20} />
                        {isOpen && <span className="font-medium">Cerrar Sesión</span>}
                    </button>
                </div>
            </aside>
        </>
    );
}
