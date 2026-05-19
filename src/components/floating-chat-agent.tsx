'use client';

import { usePathname } from 'next/navigation';
import { ChatAgent } from '@/components/chat-agent';

/**
 * Wrapper del ChatAgent flotante. Se esconde automáticamente cuando estamos
 * en la página dedicada del agente (que renderiza el chat en modo embedded).
 */
export function FloatingChatAgent() {
    const pathname = usePathname();
    if (pathname?.startsWith('/dashboard/reports/ai-agent')) return null;
    return <ChatAgent mode="floating" />;
}
