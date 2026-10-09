'use client';

import React, { useState } from 'react';
import { CheckCircle2, KeyRound, Mail, Save, Send, Server, Store, XCircle } from 'lucide-react';
import { ErrorState, InventoryHeader, LoadingState, Panel } from '@/components/inventarios/InventoryShell';
import { useInventoryReport } from '@/hooks/use-inventory-report';
import type { ConfigCorreoVista } from '@/lib/config/correo-config';
import { analizarCorreos } from '@/lib/correos';
import { getErrorMessage } from '@/lib/errors';

interface ConfigResponse {
    data: ConfigCorreoVista;
}

type Mensaje = { tono: 'ok' | 'error'; texto: string } | null;

const PRESETS = [
    { nombre: 'Gmail / Workspace', host: 'smtp.gmail.com', port: 465 },
    { nombre: 'Office 365', host: 'smtp.office365.com', port: 587 },
];

const ORIGEN: Record<ConfigCorreoVista['smtp']['origen'], string> = {
    pantalla: 'Configurado en esta pantalla',
    entorno: 'Usando las variables del servidor (.env)',
    ninguno: 'Sin configurar',
};

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors';
const labelCls = 'text-[10px] font-bold text-slate-500 uppercase tracking-wider';

function Aviso({ mensaje }: { mensaje: Mensaje }) {
    if (!mensaje) return null;
    const ok = mensaje.tono === 'ok';
    return (
        <div role="status" className={`flex items-start gap-3 rounded-2xl px-5 py-4 border text-xs ${ok ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
            {ok ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : <XCircle size={18} className="shrink-0 mt-0.5" />}
            <p className="font-semibold">{mensaje.texto}</p>
        </div>
    );
}

function Campo({ label, children, ayuda }: { label: string; children: React.ReactNode; ayuda?: string }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className={labelCls}>{label}</span>
            {children}
            {ayuda && <span className="text-[11px] text-slate-400">{ayuda}</span>}
        </label>
    );
}

/** Texto bajo una lista de correos: cuántos válidos y cuáles no lo parecen. */
function EstadoLista({ valor }: { valor: string }) {
    const { validos, invalidos } = analizarCorreos(valor);
    if (invalidos.length > 0) return <span className="text-[11px] font-semibold text-rose-600">No parece correo: {invalidos.join(', ')}</span>;
    if (validos.length === 0) return <span className="text-[11px] text-slate-400">Sin destinatarios</span>;
    return <span className="text-[11px] font-semibold text-emerald-600">{validos.length} destinatario{validos.length > 1 ? 's' : ''}</span>;
}

function FormularioCorreo({ inicial, onGuardado }: { inicial: ConfigCorreoVista; onGuardado: () => void }) {
    const [smtp, setSmtp] = useState({ host: inicial.smtp.host, port: String(inicial.smtp.port), user: inicial.smtp.user, from: inicial.smtp.from });
    const [pass, setPass] = useState('');
    const [general, setGeneral] = useState(inicial.general);
    const [porSucursal, setPorSucursal] = useState<Record<number, string>>(
        () => Object.fromEntries(inicial.sucursales.map(s => [s.IdSucursal, s.correos]))
    );
    const [guardando, setGuardando] = useState(false);
    const [mensaje, setMensaje] = useState<Mensaje>(null);
    const [correoPrueba, setCorreoPrueba] = useState('');
    const [probando, setProbando] = useState(false);
    const [mensajePrueba, setMensajePrueba] = useState<Mensaje>(null);

    const cambiarSmtp = (campo: keyof typeof smtp) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setSmtp(prev => ({ ...prev, [campo]: e.target.value }));

    const guardar = async (e: React.FormEvent) => {
        e.preventDefault();
        setGuardando(true);
        setMensaje(null);
        try {
            const res = await fetch('/api/configuracion/correo', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    smtp: { ...smtp, port: Number(smtp.port), pass },
                    general,
                    sucursales: inicial.sucursales.map(s => ({ IdSucursal: s.IdSucursal, correos: porSucursal[s.IdSucursal] ?? '' })),
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || 'No se pudo guardar');
            onGuardado();
        } catch (err: unknown) {
            setMensaje({ tono: 'error', texto: getErrorMessage(err, 'No se pudo guardar') });
            setGuardando(false);
        }
    };

    const probar = async () => {
        setProbando(true);
        setMensajePrueba(null);
        try {
            const res = await fetch('/api/configuracion/correo/prueba', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: correoPrueba }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || 'No se pudo enviar');
            setMensajePrueba({ tono: 'ok', texto: `Correo de prueba enviado a ${correoPrueba}. Revisa la bandeja (y spam).` });
        } catch (err: unknown) {
            setMensajePrueba({ tono: 'error', texto: getErrorMessage(err, 'No se pudo enviar') });
        } finally {
            setProbando(false);
        }
    };

    const conCorreos = inicial.sucursales.filter(s => analizarCorreos(porSucursal[s.IdSucursal]).validos.length > 0).length;

    return (
        <form onSubmit={guardar} className="space-y-6">
            <Panel
                title="Servidor de salida (SMTP)"
                subtitle={ORIGEN[inicial.smtp.origen]}
                action={
                    <div className="flex gap-2">
                        {PRESETS.map(p => (
                            <button key={p.host} type="button" onClick={() => setSmtp(prev => ({ ...prev, host: p.host, port: String(p.port) }))}
                                className="px-3 py-1.5 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 cursor-pointer">
                                {p.nombre}
                            </button>
                        ))}
                    </div>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-4">
                    <Campo label="Servidor" ayuda="Vacío = usar las variables SMTP_* del servidor">
                        <input className={inputCls} value={smtp.host} onChange={cambiarSmtp('host')} placeholder="smtp.gmail.com" autoComplete="off" />
                    </Campo>
                    <Campo label="Puerto" ayuda="465 = SSL · 587 = STARTTLS">
                        <input className={inputCls} type="number" min={1} max={65535} value={smtp.port} onChange={cambiarSmtp('port')} />
                    </Campo>
                    <Campo label="Usuario">
                        <input className={inputCls} value={smtp.user} onChange={cambiarSmtp('user')} placeholder="cuenta@tudominio.com" autoComplete="off" />
                    </Campo>
                    <Campo label="Contraseña" ayuda={inicial.smtp.tienePassword ? 'Hay una guardada · déjalo vacío para conservarla' : 'Gmail: usa una contraseña de aplicación'}>
                        <div className="relative">
                            <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input className={`${inputCls} pl-9`} type="password" value={pass} onChange={e => setPass(e.target.value)}
                                placeholder={inicial.smtp.tienePassword ? '••••••••' : ''} autoComplete="new-password" />
                        </div>
                    </Campo>
                    <div className="md:col-span-2">
                        <Campo label="Remitente" ayuda="Opcional. Ej.: Nexus Inventarios <cuenta@tudominio.com>">
                            <input className={inputCls} value={smtp.from} onChange={cambiarSmtp('from')} placeholder="Nexus Inventarios <cuenta@tudominio.com>" />
                        </Campo>
                    </div>
                </div>
            </Panel>

            <Panel title="Destinatarios del cierre de inventario" subtitle="Separa varios correos con coma">
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-2">
                    <Campo label="Generales · reciben el Excel con todas las sucursales">
                        <input className={inputCls} value={general} onChange={e => setGeneral(e.target.value)} placeholder="direccion@tudominio.com, inventarios@tudominio.com" />
                    </Campo>
                    <EstadoLista valor={general} />
                </div>

                <div className="flex items-center justify-between pt-2">
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                        <Store size={14} className="text-blue-600" /> Por sucursal · cada una recibe solo su Excel
                    </p>
                    <span className="text-[11px] font-semibold text-slate-400">{conCorreos} de {inicial.sucursales.length} con correo</span>
                </div>
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
                    {inicial.sucursales.map(s => (
                        <div key={s.IdSucursal} className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-2 md:gap-4 items-start px-4 py-3">
                            <span className="text-sm font-bold text-slate-700 md:pt-2.5">{s.Sucursal}</span>
                            <div className="flex flex-col gap-1">
                                <input
                                    className={inputCls}
                                    aria-label={`Correos de ${s.Sucursal}`}
                                    value={porSucursal[s.IdSucursal] ?? ''}
                                    onChange={e => setPorSucursal(prev => ({ ...prev, [s.IdSucursal]: e.target.value }))}
                                    placeholder="encargado@tudominio.com"
                                />
                                <EstadoLista valor={porSucursal[s.IdSucursal] ?? ''} />
                            </div>
                        </div>
                    ))}
                </div>
            </Panel>

            <Aviso mensaje={mensaje} />

            <div className="flex justify-end">
                <button type="submit" disabled={guardando}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait">
                    <Save size={14} className={guardando ? 'animate-pulse' : ''} />
                    {guardando ? 'Guardando…' : 'Guardar configuración'}
                </button>
            </div>

            <Panel title="Probar envío" subtitle="Usa la configuración guardada; guarda antes de probar">
                <div className="flex flex-col md:flex-row gap-3">
                    <input className={inputCls} type="email" value={correoPrueba} onChange={e => setCorreoPrueba(e.target.value)} placeholder="tu-correo@tudominio.com" aria-label="Correo para la prueba" />
                    <button type="button" onClick={probar} disabled={probando || !correoPrueba.trim()}
                        className="flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-900 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap">
                        <Send size={14} className={probando ? 'animate-pulse' : ''} />
                        {probando ? 'Enviando…' : 'Enviar prueba'}
                    </button>
                </div>
                <Aviso mensaje={mensajePrueba} />
            </Panel>
        </form>
    );
}

export default function ConfiguracionCorreoPage() {
    const config = useInventoryReport<ConfigResponse>('/api/configuracion/correo', {});
    const [version, setVersion] = useState(0);
    const [guardado, setGuardado] = useState(false);

    const alGuardar = () => {
        setGuardado(true);
        setVersion(v => v + 1);
        config.refresh();
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300 max-w-5xl">
            <InventoryHeader
                title="Configuración de correo"
                icon={Mail}
                badge="Cierres de inventario"
                lastUpdated={config.lastUpdated}
                loading={config.loading || config.refreshing}
                onRefresh={config.refresh}
            />

            {guardado && <Aviso mensaje={{ tono: 'ok', texto: 'Configuración guardada. El próximo cierre automático usará estos datos.' }} />}

            {config.error && <ErrorState message={config.error} onRetry={config.refresh} />}
            {config.loading && !config.error && <LoadingState message="Leyendo configuración..." />}
            {config.data?.data && !config.loading && !config.refreshing && (
                <FormularioCorreo key={version} inicial={config.data.data} onGuardado={alGuardar} />
            )}

            <p className="flex items-center gap-2 text-[11px] text-slate-400">
                <Server size={12} /> La contraseña se guarda cifrada en el servidor y nunca se muestra.
            </p>
        </div>
    );
}
