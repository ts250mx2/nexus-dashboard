'use client';

import { usePathname } from 'next/navigation';
import { ChatAgent } from '@/components/chat-agent';

/** Páginas con su propia superficie de agente: ahí el chat flotante sobra. */
const DEDICATED_AGENT_PATHS = [
    '/dashboard/reports/ai-agent',
    '/dashboard/reportes-ia/agente-avanzado'
];

/**
 * Wrapper del ChatAgent flotante. Se esconde automáticamente cuando estamos
 * en una página dedicada del agente (que renderiza su propia interfaz).
 */
export function FloatingChatAgent() {
    const pathname = usePathname();
    if (DEDICATED_AGENT_PATHS.some(p => pathname?.startsWith(p))) return null;
    return <ChatAgent mode="floating" />;
}
