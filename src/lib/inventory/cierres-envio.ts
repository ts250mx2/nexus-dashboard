/**
 * Después de un cierre: arma el Excel (resumen + hoja por sucursal), guarda una
 * copia en disco si CIERRE_EXCEL_DIR está definido y lo envía por correo:
 *   - destinatarios generales → el Excel completo de todas las sucursales;
 *   - destinatarios de cada sucursal → un Excel solo con su sucursal.
 * Destinatarios y SMTP salen de Configuración → Correo (o del entorno).
 * Un fallo aquí nunca deshace el cierre: se informa y ya.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getErrorMessage } from '@/lib/errors';
import { cargarDestinatarios, cargarSmtp } from '@/lib/config/correo-config';
import { parseDestinatarios } from '@/lib/correos';
import { enviarCorreo, escaparHtml, mensajeErrorSmtp } from '@/lib/mailer';
import { type ResultadoCierre, cargarCierresSucursal } from './cierres';
import { type Comparacion, compararCierres } from './cierres-comparar';
import { construirExcelCierre } from './cierres-excel';
import { type FilaResumen, filasResumen } from './cierres-reporte';

export interface EnvioCorreo {
    /** 'General' o el nombre de la sucursal. */
    destino: string;
    destinatarios: number;
    enviado: boolean;
    error?: string;
}

export interface ResultadoEnvio {
    archivo: string | null;
    correos: EnvioCorreo[];
    errores: string[];
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function cargarComparaciones(resultado: ResultadoCierre): Promise<Map<number, Comparacion>> {
    const mapa = new Map<number, Comparacion>();
    for (const s of resultado.sucursales.filter(x => x.ok)) {
        // Solo hasta el cierre recién tomado: los dos últimos días bastan para la transición.
        const dias = (await cargarCierresSucursal(s.IdSucursal)).filter(d => d.fecha <= s.fecha).slice(-2);
        mapa.set(s.IdSucursal, compararCierres(dias, null));
    }
    return mapa;
}

const fmtNum = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 2 });
const fmtMoneda = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

function cuerpoCorreo(resultado: ResultadoCierre, resumen: FilaResumen[], titulo: string): string {
    const celda = 'style="padding:6px 10px;border:1px solid #cbd5e1"';
    const derecha = 'style="padding:6px 10px;border:1px solid #cbd5e1;text-align:right"';
    const filas = resumen.map(f => `
        <tr${f.Guardado === 'No' || f.ConDiferencia > 0 ? ' style="background:#fef2f2"' : ''}>
            <td ${celda}>${escaparHtml(f.Sucursal)}</td>
            <td ${celda}>${f.Guardado}</td>
            <td ${derecha}>${fmtNum(f.Articulos)}</td>
            <td ${derecha}>${fmtMoneda(f.Valor)}</td>
            <td ${derecha}>${fmtNum(f.Cuadran)}</td>
            <td ${derecha}>${fmtNum(f.ConDiferencia)}</td>
            <td ${derecha}>${fmtNum(f.UnidadesDiferencia)}</td>
            <td ${derecha}>${fmtMoneda(f.ValorDiferencia)}</td>
            <td ${celda}>${escaparHtml(f.Observaciones)}</td>
        </tr>`).join('');

    return `
        <div style="font-family:Calibri,Arial,sans-serif;color:#0f172a">
            <h2 style="margin:0 0 4px">Cierre de inventario${titulo ? ` · ${escaparHtml(titulo)}` : ''} · ${resultado.fecha}</h2>
            <p style="margin:0 0 16px;color:#475569">Se adjunta el Excel con el detalle por sucursal.</p>
            <table style="border-collapse:collapse;font-size:13px">
                <thead style="background:#2563eb;color:#fff">
                    <tr>
                        <th ${celda}>Sucursal</th><th ${celda}>Guardado</th><th ${celda}>Artículos</th>
                        <th ${celda}>Valor</th><th ${celda}>Cuadran</th><th ${celda}>Con diferencia</th>
                        <th ${celda}>Unid. dif.</th><th ${celda}>Valor dif.</th><th ${celda}>Observaciones</th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
            </table>
        </div>`;
}

interface Paquete {
    destino: string;
    to: string[];
    resultado: ResultadoCierre;
}

function asunto(p: Paquete, resumen: FilaResumen[]): string {
    const conDif = resumen.reduce((acc, f) => acc + f.ConDiferencia, 0);
    const fallidas = resumen.filter(f => f.Guardado === 'No').length;
    const alerta = [fallidas ? `${fallidas} sucursal(es) fallaron` : '', conDif ? `${conDif} artículos con diferencia` : '']
        .filter(Boolean).join(' · ');
    const quien = p.destino === 'General' ? '' : ` ${p.destino}`;
    return `Cierre de inventario${quien} ${p.resultado.fecha}${alerta ? ` · ${alerta}` : ''}`;
}

/** Correos a mandar: uno general con todo y uno por sucursal que tenga destinatarios. */
async function armarPaquetes(resultado: ResultadoCierre): Promise<Paquete[]> {
    const destinos = await cargarDestinatarios();
    const paquetes: Paquete[] = [];
    const general = parseDestinatarios(destinos.general);
    if (general.length > 0) paquetes.push({ destino: 'General', to: general, resultado });
    for (const s of resultado.sucursales) {
        const to = parseDestinatarios(destinos.porSucursal.get(s.IdSucursal));
        if (to.length > 0) paquetes.push({ destino: s.Sucursal, to, resultado: { ...resultado, sucursales: [s] } });
    }
    return paquetes;
}

async function guardarCopia(nombre: string, excel: Buffer): Promise<string | null> {
    const dir = process.env.CIERRE_EXCEL_DIR;
    if (!dir) return null;
    await mkdir(dir, { recursive: true });
    const archivo = path.join(dir, nombre);
    await writeFile(archivo, excel);
    return archivo;
}

export async function enviarReporteCierre(resultado: ResultadoCierre): Promise<ResultadoEnvio> {
    const errores: string[] = [];
    const comparaciones = await cargarComparaciones(resultado);
    const nombre = (sufijo: string) => `Cierre_Inventario_${resultado.fecha}${sufijo}.xlsx`;

    let archivo: string | null = null;
    try {
        archivo = await guardarCopia(nombre(''), construirExcelCierre(resultado, comparaciones));
    } catch (err) {
        errores.push(`No se pudo guardar el Excel: ${getErrorMessage(err, 'error desconocido')}`);
    }

    const paquetes = await armarPaquetes(resultado);
    const { config: smtp } = await cargarSmtp().catch(err => {
        console.error('Reporte de cierre: configuración SMTP ilegible:', err);
        errores.push(`No se pudo leer la configuración SMTP: ${mensajeErrorSmtp(err)}`);
        return { config: null };
    });
    const correos: EnvioCorreo[] = [];
    if (paquetes.length === 0) errores.push('No hay destinatarios configurados para el cierre.');
    if (!smtp) {
        if (paquetes.length > 0) errores.push('El SMTP de salida no está configurado.');
        for (const e of errores) console.error(`Reporte de cierre: ${e}`);
        return { archivo, correos, errores };
    }

    for (const p of paquetes) {
        const resumen = filasResumen(p.resultado, comparaciones);
        const sufijo = p.destino === 'General' ? '' : `_${p.destino.replace(/[^A-Za-z0-9]+/g, '_')}`;
        try {
            await enviarCorreo(smtp, {
                to: p.to,
                subject: asunto(p, resumen),
                html: cuerpoCorreo(p.resultado, resumen, p.destino === 'General' ? '' : p.destino),
                attachments: [{ filename: nombre(sufijo), content: construirExcelCierre(p.resultado, comparaciones), contentType: XLSX_MIME }],
            });
            correos.push({ destino: p.destino, destinatarios: p.to.length, enviado: true });
        } catch (err) {
            console.error(`Reporte de cierre: envío a ${p.destino} falló:`, err);
            const error = mensajeErrorSmtp(err);
            correos.push({ destino: p.destino, destinatarios: p.to.length, enviado: false, error });
            errores.push(`No se pudo enviar el correo de ${p.destino}: ${error}`);
        }
    }

    for (const e of errores) console.error(`Reporte de cierre: ${e}`);
    return { archivo, correos, errores };
}
