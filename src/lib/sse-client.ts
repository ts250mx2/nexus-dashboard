/**
 * Cliente SSE liviano: lee un Response como flujo de eventos tipados.
 * No usa EventSource (que solo soporta GET); parsea SSE manualmente sobre fetch.
 */

export interface SseClientEvent {
    event: string;
    data: any;
}

export async function* readSseStream(
    response: Response,
    signal?: AbortSignal
): AsyncGenerator<SseClientEvent, void, void> {
    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            if (signal?.aborted) {
                try { await reader.cancel(); } catch { }
                return;
            }

            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let blockEnd = buffer.indexOf('\n\n');
            while (blockEnd !== -1) {
                const block = buffer.substring(0, blockEnd);
                buffer = buffer.substring(blockEnd + 2);

                const parsed = parseBlock(block);
                if (parsed) yield parsed;

                blockEnd = buffer.indexOf('\n\n');
            }
        }
    } finally {
        try { reader.releaseLock(); } catch { }
    }
}

function parseBlock(block: string): SseClientEvent | null {
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const rawLine of block.split('\n')) {
        const line = rawLine.trimEnd();
        if (!line || line.startsWith(':')) continue;

        if (line.startsWith('event:')) {
            eventName = line.substring(6).trim();
        } else if (line.startsWith('data:')) {
            dataLines.push(line.substring(5).trim());
        }
    }

    if (dataLines.length === 0) return null;

    const dataStr = dataLines.join('\n');
    let data: any;
    try {
        data = JSON.parse(dataStr);
    } catch {
        data = { raw: dataStr };
    }

    return { event: eventName, data };
}
