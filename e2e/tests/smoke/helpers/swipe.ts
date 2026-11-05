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
 * into native scrolling: vertically on a category's card track, sideways on the category track.
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
 * 040 (D325): a vertical swipe across the middle of the screen: upward = next card, downward =
 * previous. Each category's cards sit on a native vertical scroll-snap track, so this is a real
 * touch scroll, not a synthetic gesture. CDP touches end without a fling, so mandatory snapping
 * lands on the nearest card: the drag must clear half a page after the touch slop, hence 0.65.
 * It starts above the dock (next) or below the top bar (prev).
 */
export async function swipeCard(page: Page, step: 'next' | 'prev'): Promise<void> {
  const { width, height } = viewport(page);
  const distance = Math.round(height * 0.65);
  await swipe(page, {
    x: Math.round(width / 2),
    y: Math.round(height * (step === 'next' ? 0.8 : 0.2)),
    dx: 0,
    dy: step === 'next' ? -distance : distance,
    durationMs: 150,
  });
}

/**
 * 040 (D325): a sideways swipe across the middle of the screen, clear of the edge strips
 * (D327): leftward = next category, rightward = previous. The categories sit on a native
 * horizontal scroll-snap track, always left to right.
 */
export async function swipeCategory(page: Page, step: 'next' | 'prev'): Promise<void> {
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

/** A long upward drag from near the bottom: scrolls a sheet (full view) past its end. */
export async function swipeUpLong(page: Page): Promise<void> {
  const { width, height } = viewport(page);
  await swipe(page, {
    x: Math.round(width / 2),
    y: Math.round(height * 0.9),
    dx: 0,
    dy: -Math.round(height * 0.8),
    durationMs: 250,
    steps: 12,
  });
}
