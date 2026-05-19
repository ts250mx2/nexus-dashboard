/**
 * Rate limiter en memoria (sliding window por key).
 * Single-instance. Si escalan a multi-instance, migrar a Redis.
 */

interface Bucket {
    hits: number[];
}

export interface RateLimitConfig {
    windowMs: number;
    max: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfterMs: number;
    current: number;
}

export interface RateLimiter {
    check(key: string): RateLimitResult;
    reset(key: string): void;
    stats(): { totalKeys: number };
}

export function createRateLimiter(config: RateLimitConfig): RateLimiter {
    const buckets = new Map<string, Bucket>();
    const { windowMs, max } = config;

    if (typeof setInterval !== 'undefined') {
        setInterval(() => {
            const cutoff = Date.now() - windowMs * 2;
            for (const [key, b] of buckets.entries()) {
                if (b.hits.length === 0 || b.hits[b.hits.length - 1] < cutoff) {
                    buckets.delete(key);
                }
            }
        }, windowMs);
    }

    return {
        check(key: string): RateLimitResult {
            const now = Date.now();
            const cutoff = now - windowMs;
            let bucket = buckets.get(key);
            if (!bucket) {
                bucket = { hits: [] };
                buckets.set(key, bucket);
            }
            bucket.hits = bucket.hits.filter(t => t > cutoff);

            if (bucket.hits.length >= max) {
                const oldest = bucket.hits[0];
                return {
                    allowed: false,
                    remaining: 0,
                    retryAfterMs: Math.max(0, oldest + windowMs - now),
                    current: bucket.hits.length
                };
            }

            bucket.hits.push(now);
            return {
                allowed: true,
                remaining: max - bucket.hits.length,
                retryAfterMs: 0,
                current: bucket.hits.length
            };
        },
        reset(key: string) {
            buckets.delete(key);
        },
        stats() {
            return { totalKeys: buckets.size };
        }
    };
}

export const queryLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
export const alertCreateLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
export const cronLimiter = createRateLimiter({ windowMs: 60_000, max: 5 });
