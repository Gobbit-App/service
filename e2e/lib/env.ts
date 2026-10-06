export interface E2eEnv {
  baseURL: string;
  /** Owner bearer session seeded by `pnpm db:seed` when `SMOKE_SESSION_TOKEN` is set (D43). */
  token: string;
  /** When set (CI: the commit that triggered the run), smoke waits until /health reports it. */
  expectedSha?: string;
  /**
   * Origin of the web app for the `web-smoke` project (D62). Defaults to BASE_URL without its
   * `/api` suffix (the deployed layout, D51), else the Vite dev server.
   */
  webBaseURL: string;
}

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_WEB_BASE_URL = 'http://localhost:5173';
const API_SUFFIX = /\/api$/;

type EnvSource = Record<string, string | undefined>;

// GitHub Actions passes unset vars/secrets as empty strings, so blank counts as missing.
function read(env: EnvSource, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

export function resolveE2eEnv(env: EnvSource = process.env): E2eEnv {
  const rawBaseURL = read(env, 'BASE_URL');

  if (!rawBaseURL && read(env, 'CI')) {
    throw new Error(
      'BASE_URL is not set. In CI, configure the API_BASE_URL repository variable ' +
        '(and the SMOKE_SESSION_TOKEN secret) to point the smoke tests at a deployed API.',
    );
  }

  const baseURL = httpUrl('BASE_URL', rawBaseURL ?? DEFAULT_BASE_URL);
  const rawWebBaseURL = read(env, 'WEB_BASE_URL');
  const webBaseURL = rawWebBaseURL
    ? httpUrl('WEB_BASE_URL', rawWebBaseURL)
    : API_SUFFIX.test(baseURL)
      ? baseURL.replace(API_SUFFIX, '')
      : DEFAULT_WEB_BASE_URL;

  return {
    baseURL,
    token: read(env, 'SMOKE_SESSION_TOKEN') ?? '',
    expectedSha: read(env, 'EXPECTED_SHA'),
    webBaseURL,
  };
}

/** Validates an http(s) URL and strips trailing slashes. */
function httpUrl(key: string, value: string): string {
  const url = value.replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${key} is not a valid URL: "${url}"`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${key} must use http or https: "${url}"`);
  }
  return url;
}
