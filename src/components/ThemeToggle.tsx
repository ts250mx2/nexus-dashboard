'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CLASE_OSCURO, CLAVE_TEMA, aplicarTema, temaGuardado, type Tema } from '@/lib/tema';

/**
 * Interruptor de tema del encabezado.
 *
 * El tema ya quedó aplicado por el script que corre antes de pintar, así que
 * aquí solo se lee del elemento raíz para arrancar sincronizado. Hasta que el
 * componente monta no se sabe cuál está puesto —el servidor no tiene acceso a
 * localStorage—, por eso el icono no se dibuja en el primer render: pintar el
 * sol y cambiarlo a luna se vería como un parpadeo.
 */
export default function ThemeToggle({ className }: { className?: string }) {
    const [tema, setTema] = useState<Tema | null>(null);

    useEffect(() => {
        const guardado = temaGuardado(localStorage.getItem(CLAVE_TEMA));
        const actual: Tema = guardado
            ?? (document.documentElement.classList.contains(CLASE_OSCURO) ? 'oscuro' : 'claro');
        setTema(actual);
    }, []);

    const cambiar = () => {
        const siguiente: Tema = tema === 'oscuro' ? 'claro' : 'oscuro';
        setTema(siguiente);
        aplicarTema(siguiente);
        try {
            localStorage.setItem(CLAVE_TEMA, siguiente);
        } catch {
            // Navegación privada o almacenamiento bloqueado: el tema vale para
            // esta sesión y no se recuerda. No es motivo para romper el botón.
        }
    };

    const esOscuro = tema === 'oscuro';

    return (
        <button
            type="button"
            onClick={cambiar}
            title={esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            aria-label={esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className={cn(
                'p-2 rounded-xl border transition-colors cursor-pointer',
                'bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50',
                'dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700',
                className
            )}
        >
            {/* Mientras no se sabe el tema se deja el hueco, para que el encabezado no salte. */}
            {tema === null
                ? <span className="block w-[18px] h-[18px]" />
                : esOscuro ? <Sun size={18} /> : <Moon size={18} />}
        </button>
    );
}
