import { NextResponse } from 'next/server';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

// In-memory sliding window store (can also integrate Upstash Redis for distributed multi-region deployments)
const rateLimitStore = new Map<string, RateLimitRecord>();

// Cleanup stale entries every 5 minutes to prevent memory leaks
if (typeof globalThis !== 'undefined') {
  const globalObj = globalThis as any;
  if (!globalObj.__rateLimitCleanupInterval) {
    globalObj.__rateLimitCleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, record] of rateLimitStore.entries()) {
        if (now > record.resetTime) {
          rateLimitStore.delete(key);
        }
      }
    }, 5 * 60 * 1000);
  }
}

export interface RateLimitConfig {
  limit: number;      // Maximum requests allowed in window
  windowMs: number;   // Window size in milliseconds
}

export function checkRateLimit(
  request: Request,
  routeKey: string,
  config: RateLimitConfig = { limit: 10, windowMs: 60 * 1000 }
): { allowed: boolean; remaining: number; resetTime: number; response?: NextResponse } {
  // Extract client identifier: X-Forwarded-For IP, Authorization header, or fallback IP
  const forwarded = request.headers.get('x-forwarded-for');
  const auth = request.headers.get('authorization') || '';
  const clientIp = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';
  const clientId = auth ? `${clientIp}:${auth.slice(-16)}` : clientIp;

  const key = `${routeKey}:${clientId}`;
  const now = Date.now();

  let record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    record = {
      count: 1,
      resetTime: now + config.windowMs
    };
    rateLimitStore.set(key, record);
  } else {
    record.count += 1;
  }

  const remaining = Math.max(0, config.limit - record.count);

  if (record.count > config.limit) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    const response = NextResponse.json(
      {
        success: false,
        error: `Rate limit exceeded (${config.limit} requests/min). Please try again in ${retryAfter} seconds.`,
        retryAfter
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(config.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(record.resetTime / 1000))
        }
      }
    );
    return { allowed: false, remaining: 0, resetTime: record.resetTime, response };
  }

  return { allowed: true, remaining, resetTime: record.resetTime };
}
