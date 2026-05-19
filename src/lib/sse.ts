/**
 * Server-Sent Events helpers para streaming desde Next.js route handlers.
 *
 * Formato wire:
 *   event: text-delta
 *   data: {"text":"..."}
 *
 *   event: done
 *   data: {}
 */

export type SseEventName =
    | 'text-delta'
    | 'status'
    | 'metadata'
    | 'clarification'
    | 'error'
    | 'done';

export interface SseEvent {
    event: SseEventName;
    data: unknown;
}

const encoder = new TextEncoder();

export function formatSse(event: SseEvent): Uint8Array {
    const dataLine = `data: ${JSON.stringify(event.data ?? {})}`;
    const block = `event: ${event.event}\n${dataLine}\n\n`;
    return encoder.encode(block);
}

export function createSseStream(
    handler: (emit: (event: SseEvent) => void, close: () => void) => Promise<void>
): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
        async start(controller) {
            let closed = false;

            const emit = (event: SseEvent) => {
                if (closed) return;
                try {
                    controller.enqueue(formatSse(event));
                } catch {
                    closed = true;
                }
            };

            const close = () => {
                if (closed) return;
                closed = true;
                try {
                    controller.close();
                } catch { }
            };

            try {
                await handler(emit, close);
            } catch (err: any) {
                emit({ event: 'error', data: { message: err?.message || 'Error en stream' } });
            } finally {
                close();
            }
        }
    });
}

export const SSE_HEADERS = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
};
