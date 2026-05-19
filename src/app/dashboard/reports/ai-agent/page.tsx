'use client';

import { ChatAgent } from '@/components/chat-agent';

/**
 * Página del Agente IA a pantalla completa.
 * Reutiliza el mismo componente ChatAgent que el widget flotante, pero en
 * modo "embedded" para que ocupe todo el contenedor sin overlay.
 */
export default function AgentPage() {
    return (
        <div className="fixed inset-0 lg:left-64 top-0 bg-slate-50">
            <ChatAgent mode="embedded" />
        </div>
    );
}
