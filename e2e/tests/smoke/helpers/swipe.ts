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
 * into native scrolling: sideways on the Browse track, vertically inside the current page.
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

/**
 * 033 (D244): a sideways swipe across the middle of the screen: leftward = next card,
 * rightward = previous. The track is a native scroll-snap container, so this is a real
 * touch scroll, not a synthetic gesture.
 */
export async function swipeCard(page: Page, step: 'next' | 'prev'): Promise<void> {
  const { width, height } = viewport(page);
  const distance = Math.round(width * 0.6);
  await swipe(page, {
    x: Math.round(width * (step === 'next' ? 0.8 : 0.2)),
    y: Math.round(height / 2),
    dx: step === 'next' ? -distance : distance,
    dy: 0,
    durationMs: 150,
  });
}

/** A vertical drag in the middle of the screen: `up` scrolls the current page down. */
export async function swipeUp(page: Page): Promise<void> {
  const { width, height } = viewport(page);
  const distance = Math.round(height * 0.4);
  await swipe(page, {
    x: Math.round(width / 2),
    y: Math.round(height * 0.7),
    dx: 0,
    dy: -distance,
    durationMs: 200,
  });
}
