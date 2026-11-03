/**
 * 037 (D296/D297): whether this device can receive reminder pushes, decided from plain inputs so
 * it's testable without a browser. iPhone and iPad Safari offer Web Push only to a site added to
 * the Home Screen (standalone display mode).
 */
export type PushSupport = 'ready' | 'denied' | 'unsupported' | 'ios-not-installed';

export type PushEnvironment = {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  permission: NotificationPermission | undefined;
  userAgent: string;
  standalone: boolean;
};

const IOS = /iPhone|iPad|iPod/;
/** iPadOS 13+ reports itself as a Mac; a touch-capable "Macintosh" is an iPad. */
const IPAD_AS_MAC = /Macintosh/;

export function isIos(userAgent: string, maxTouchPoints = 0): boolean {
  return IOS.test(userAgent) || (IPAD_AS_MAC.test(userAgent) && maxTouchPoints > 1);
}

export function pushSupport(env: PushEnvironment, maxTouchPoints = 0): PushSupport {
  const capable = env.hasServiceWorker && env.hasPushManager && env.hasNotification;
  if (isIos(env.userAgent, maxTouchPoints) && !env.standalone) return 'ios-not-installed';
  if (!capable) return 'unsupported';
  if (env.permission === 'denied') return 'denied';
  return 'ready';
}

/** Reads the real browser into a `PushEnvironment`. */
export function browserPushEnvironment(): PushEnvironment {
  const hasNotification = typeof Notification !== 'undefined';
  return {
    hasServiceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    hasPushManager: typeof window !== 'undefined' && 'PushManager' in window,
    hasNotification,
    permission: hasNotification ? Notification.permission : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    standalone:
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(display-mode: standalone)').matches === true ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true),
  };
}

/** The VAPID public key (base64url) as the bytes `pushManager.subscribe` wants. */
export function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const base64 = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const BROWSERS: Array<[RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];
const SYSTEMS: Array<[RegExp, string]> = [
  [/Android/, 'Android'],
  [/iPhone|iPod/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'Mac'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

/** D297: a short device label for Settings ("Chrome on Android"); never the raw user agent. */
export function deviceLabel(userAgent: string): string | undefined {
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
  const system = SYSTEMS.find(([re]) => re.test(userAgent))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system;
}
