export interface E2eEnv {
  baseURL: string;
  /** Owner bearer session seeded by `pnpm db:seed` when `SMOKE_SESSION_TOKEN` is set (D43). */
  token: string;
}

const DEFAULT_BASE_URL = 'http://localhost:3000';

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

  const baseURL = (rawBaseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(baseURL);
  } catch {
    throw new Error(`BASE_URL is not a valid URL: "${baseURL}"`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`BASE_URL must use http or https: "${baseURL}"`);
  }

  return {
    baseURL,
    token: read(env, 'SMOKE_SESSION_TOKEN') ?? '',
  };
}
