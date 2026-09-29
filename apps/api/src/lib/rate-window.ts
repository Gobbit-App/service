export const RATE_WINDOW_MS = 3_600_000;

/** Start of the fixed window containing `now` (floor of epoch ms to windowMs). */
export function windowStart(now: Date, windowMs = RATE_WINDOW_MS): Date {
  const ms = now.getTime();
  const windowStartMs = Math.floor(ms / windowMs) * windowMs;
  return new Date(windowStartMs);
}

/** Whole seconds until the window containing `now` ends; minimum 1. */
export function retryAfterSeconds(now: Date, windowMs = RATE_WINDOW_MS): number {
  const ms = now.getTime();
  const windowStartMs = Math.floor(ms / windowMs) * windowMs;
  const windowEndMs = windowStartMs + windowMs;
  const remainingMs = windowEndMs - ms;
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

/** True when `count` (after increment) exceeds `limit`. */
export function isOverLimit(count: number, limit: number): boolean {
  return count > limit;
}

/** Rate limiter key generators for different request types. */
export const rateKeys = {
  magicLinkEmail: (emailHash: string) => `magic-link:email:${emailHash}`,
  magicLinkIp: (ip: string) => `magic-link:ip:${ip}`,
  callbackIp: (ip: string) => `callback:ip:${ip}`,
};
