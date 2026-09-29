import { safeNextPath } from './next-path';

export interface RedirectEnv {
  API_URL: string;
  APP_URL?: string;
}

/** D26: where a consumed link lands — the web app at `next` (default `/`), else the API's `/me`. */
export function callbackSuccessLocation(env: RedirectEnv, next: string | null): string {
  if (env.APP_URL) {
    return `${env.APP_URL}${safeNextPath(next) ?? '/'}`;
  }
  return `${env.API_URL}/me`;
}

/** D26: the web app's error page for a bad link, or null when there is no web app to send to. */
export function callbackFailureLocation(env: RedirectEnv, reason: string): string | null {
  if (!env.APP_URL) {
    return null;
  }
  return `${env.APP_URL}/auth/error?reason=${encodeURIComponent(reason)}`;
}
