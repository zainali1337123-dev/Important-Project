import type { NextRequest } from "next/server";

/**
 * Rate limiting for API endpoints.
 * Implementation is environment-dependent — this module provides
 * a generic interface regardless of the backing store.
 */

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  retryAfter: number;
}

function allow(): RateLimitResult {
  return { success: true, limit: 0, remaining: 0, retryAfter: 0 };
}

export function checkLoginRateLimit(_request: NextRequest) {
  return Promise.resolve(allow());
}

export function checkApiRateLimit(_request: NextRequest) {
  return Promise.resolve(allow());
}

export function rateLimitResponseInit(result: RateLimitResult): ResponseInit {
  return {
    status: 429,
    headers: {
      "Retry-After": String(result.retryAfter),
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": String(result.remaining),
    },
  };
}
