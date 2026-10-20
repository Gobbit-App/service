import type { CDPSession, Page } from '@playwright/test';

export interface SwipeOptions {
  /** Start point in CSS px (viewport coordinates). */
  x: number;
  y: number;
  /** Movement in CSS px; negative dx = leftward. */
  dx: number;
  dy: number;
  /** Total duration of the drag (ms). */
  durationMs?: number;
  /** Intermediate touchMove events. */
  steps?: number;
}

const sessions = new WeakMap<Page, CDPSession>();

async function cdp(page: Page): Promise<CDPSession> {
  let session = sessions.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    sessions.set(page, session);
  }
  return session;
}

/**
 * T008: a one-finger touch drag through CDP `Input.dispatchTouchEvent` (Chromium only; the
 * web-smoke project emulates a Pixel 7, so `hasTouch` is on). The browser turns the touches
 * into pointer events (what `@use-gesture` reads) and, for vertical drags outside
 * `touch-action: pan-y` zones, into native scrolling.
 */
export async function swipe(page: Page, options: SwipeOptions): Promise<void> {
  const { x, y, dx, dy, durationMs = 200, steps = 8 } = options;
  const session = await cdp(page);
  const point = (px: number, py: number) => [{ x: px, y: py, id: 1, radiusX: 1, radiusY: 1 }];

  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(x, y) });
  for (let i = 1; i <= steps; i += 1) {
    await page.waitForTimeout(durationMs / steps);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: point(x + (dx * i) / steps, y + (dy * i) / steps),
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Viewport size (the emulated device), for zone-relative start points. */
export function viewport(page: Page): { width: number; height: number } {
  const size = page.viewportSize();
  if (!size) throw new Error('swipe helper needs a fixed viewport (device emulation)');
  return size;
}

/** A leftward (next) or rightward (prev) swipe across the middle of a horizontal band. */
export async function swipeBand(
  page: Page,
  bandY: number,
  step: 'next' | 'prev',
  startX?: number,
): Promise<void> {
  const { width } = viewport(page);
  const distance = Math.round(width * 0.4);
  const x = startX ?? (step === 'next' ? Math.round(width * 0.7) : Math.round(width * 0.3));
  await swipe(page, { x, y: bandY, dx: step === 'next' ? -distance : distance, dy: 0 });
}

/** A vertical page swipe in the middle zone: up = next card, down = previous card. */
export async function swipeCard(page: Page, step: 'next' | 'prev'): Promise<void> {
  const { width, height } = viewport(page);
  const distance = Math.round(height * 0.35);
  await swipe(page, {
    x: Math.round(width / 2),
    y: Math.round(height * (step === 'next' ? 0.65 : 0.35)),
    dx: 0,
    dy: step === 'next' ? -distance : distance,
    durationMs: 150,
  });
}
