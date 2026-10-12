import { parseArgs } from 'node:util';

/** D82: the search scripts talk to a running API (local or deployed) as the deck owner. */
export interface ApiCliOptions {
  baseUrl: string;
  token: string;
  deck: string;
  positionals: string[];
}

const DEFAULT_BASE_URL = 'http://localhost:3000';

/** `--deck`, `--base-url` (or BASE_URL), `--token` (or SMOKE_SESSION_TOKEN); the rest are positionals. */
export function parseApiCliArgs(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
): ApiCliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      deck: { type: 'string', default: 'search-demo' },
      'base-url': { type: 'string' },
      token: { type: 'string' },
    },
  });
  const token = values.token ?? env.SMOKE_SESSION_TOKEN ?? '';
  if (!token) throw new Error('Pass --token or set SMOKE_SESSION_TOKEN (an owner bearer session)');
  const baseUrl = (values['base-url'] ?? env.BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  return { baseUrl, token, deck: values.deck, positionals };
}

export class ApiCliError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    body: string,
  ) {
    super(`${path} → ${status}: ${body.slice(0, 300)}`);
    this.name = 'ApiCliError';
  }
}

/** JSON request with the bearer header; throws `ApiCliError` on a non-2xx answer. */
export function createApiClient(opts: Pick<ApiCliOptions, 'baseUrl' | 'token'>) {
  return async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${opts.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${opts.token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new ApiCliError(res.status, `${method} ${path}`, await res.text());
    return (await res.json()) as T;
  };
}

export type ApiRequest = ReturnType<typeof createApiClient>;

/** Cards whose title is not in the deck yet (the loader is idempotent by title). */
export function cardsToCreate<T extends { card: { title: string } }>(
  cards: readonly T[],
  existingTitles: ReadonlySet<string>,
): T[] {
  return cards.filter(({ card }) => !existingTitles.has(card.title));
}
