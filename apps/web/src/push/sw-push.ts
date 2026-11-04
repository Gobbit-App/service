/**
 * 037 (D296): what the service worker does with a reminder push and a tap on it. Pure functions
 * over injected browser pieces so they test without a worker. No zod here (SW bundle size).
 */
import type { PushMessage } from '@gobbit/shared/reminders';

export const PUSH_ICON = '/icons/icon-192.png';
const FALLBACK: PushMessage = {
  title: 'Gobbit',
  body: 'A reminder is due.',
  url: '/',
  tag: 'gobbit',
};

/** Only same-origin app paths ("/i/…"); never "//host" or an absolute URL. */
export function safeAppPath(url: unknown): string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/';
}

/** Reads a push payload; anything unexpected becomes a generic notice rather than nothing. */
export function parsePushPayload(read: (() => unknown) | undefined): PushMessage {
  if (!read) return FALLBACK;
  try {
    const data = read() as Partial<Record<keyof PushMessage, unknown>> | null;
    if (!data || typeof data.title !== 'string') return FALLBACK;
    return {
      title: data.title,
      body: typeof data.body === 'string' ? data.body : '',
      url: safeAppPath(data.url),
      tag: typeof data.tag === 'string' && data.tag ? data.tag : FALLBACK.tag,
    };
  } catch {
    return FALLBACK;
  }
}

export type ShowNotification = (title: string, options: NotificationOptions) => Promise<void>;

/** `push` event: always shows a notification (userVisibleOnly), one per reminder tag. */
export function showReminder(message: PushMessage, show: ShowNotification): Promise<void> {
  return show(message.title, {
    body: message.body,
    tag: message.tag,
    icon: PUSH_ICON,
    badge: PUSH_ICON,
    data: { url: message.url },
  });
}

/** The bits of a service-worker `WindowClient` used here (that type lives in the webworker lib). */
type WindowLike = {
  url: string;
  focus: () => Promise<WindowLike>;
  navigate?: (url: string) => Promise<unknown>;
};

export type ClickDeps = {
  origin: string;
  windows: () => Promise<readonly WindowLike[]>;
  open: (url: string) => Promise<unknown>;
};

/** `notificationclick`: focus an open Gobbit window on the card, or open one. */
export async function openFromNotification(data: unknown, deps: ClickDeps): Promise<void> {
  const path = safeAppPath((data as { url?: unknown } | null)?.url);
  const target = new URL(path, deps.origin).href;
  const windows = await deps.windows();
  const same = windows.find((w) => new URL(w.url).origin === deps.origin);
  if (!same) {
    await deps.open(target);
    return;
  }
  const client: WindowLike = await same.focus();
  if (client.url !== target) await client.navigate?.(target);
}
