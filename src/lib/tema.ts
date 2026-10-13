/**
 * Tema claro / oscuro del portal.
 *
 * La elección vive en localStorage y se aplica como clase `dark` en el elemento
 * raíz. Hay dos lugares que tienen que coincidir: el script que corre antes de
 * pintar (para que no haya un parpadeo blanco al cargar) y el interruptor del
 * encabezado. Por eso la lógica está aquí, en un solo sitio, y el script se
 * genera desde estas mismas constantes.
 */

export type Tema = 'claro' | 'oscuro';

/** Clave en localStorage. Con prefijo para no chocar con otras apps del dominio. */
export const CLAVE_TEMA = 'nexus-tema';

/** Clase que Tailwind busca para aplicar las variantes `dark:`. */
export const CLASE_OSCURO = 'dark';

/** Interpreta lo guardado; cualquier cosa rara se trata como sin elección. */
export function temaGuardado(valor: string | null): Tema | null {
    return valor === 'claro' || valor === 'oscuro' ? valor : null;
}

/** Pone o quita la clase en el elemento raíz. */
export function aplicarTema(tema: Tema): void {
    document.documentElement.classList.toggle(CLASE_OSCURO, tema === 'oscuro');
}

/**
 * Script que corre antes del primer pintado: si no se aplica aquí, la página
 * aparece en claro y salta a oscuro cuando React monta.
 *
 * Sin elección guardada se respeta la preferencia del sistema, que es lo que
 * espera quien ya tiene su equipo en oscuro.
 */
export const SCRIPT_TEMA_INICIAL = `(function(){try{
var g=localStorage.getItem('${CLAVE_TEMA}');
var oscuro = g==='oscuro' || (g!=='claro' && window.matchMedia('(prefers-color-scheme: dark)').matches);
if(oscuro) document.documentElement.classList.add('${CLASE_OSCURO}');
}catch(e){}})();`;
