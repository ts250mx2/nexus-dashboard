/**
 * Logger estructurado liviano (JSON una línea por log).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const MIN_LEVEL: number = LOG_LEVELS[
    (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || 'info'
] ?? LOG_LEVELS.info;

export interface Logger {
    debug(msg: string, context?: Record<string, any>): void;
    info(msg: string, context?: Record<string, any>): void;
    warn(msg: string, context?: Record<string, any>): void;
    error(msg: string, context?: Record<string, any>): void;
    child(extraContext: Record<string, any>): Logger;
}

function emit(level: LogLevel, msg: string, baseContext: Record<string, any>, extraContext?: Record<string, any>) {
    if (LOG_LEVELS[level] < MIN_LEVEL) return;
    const entry = {
        ts: new Date().toISOString(),
        level,
        msg,
        ...baseContext,
        ...(extraContext || {})
    };
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
}

export function createLogger(baseContext: Record<string, any> = {}): Logger {
    return {
        debug: (msg, ctx) => emit('debug', msg, baseContext, ctx),
        info: (msg, ctx) => emit('info', msg, baseContext, ctx),
        warn: (msg, ctx) => emit('warn', msg, baseContext, ctx),
        error: (msg, ctx) => emit('error', msg, baseContext, ctx),
        child: (extraContext) => createLogger({ ...baseContext, ...extraContext })
    };
}

export const logger = createLogger({ component: 'nexus-agent' });
