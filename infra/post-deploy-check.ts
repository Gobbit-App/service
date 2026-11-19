// Post-deploy check (specs/047-e2e-isolation/contracts/post-deploy-check.md): GET-only, no env reads.
import { pathToFileURL } from 'node:url';

export interface Deps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  out: (line: string) => void;
}

const POLL_MS = 2000;

function parseArgs(args: string[]): { origin: string; sha: string; minutes: number } | null {
  const [raw, ...rest] = args;
  const origin = raw?.replace(/\/$/, '') ?? '';
  if (!/^https?:\/\/[^/\s]+$/.test(origin)) return null;
  let sha = '';
  let minutes = 10;
  for (let i = 0; i < rest.length; i += 2) {
    const value = rest[i + 1];
    if (!value) return null;
    if (rest[i] === '--sha') sha = value;
    else if (rest[i] === '--timeout-minutes') minutes = Number(value);
    else return null;
  }
  if (!sha || !(minutes > 0)) return null;
  return { origin, sha, minutes };
}

/** Returns the process exit code: 0 all passed, 1 a check failed, 2 bad arguments. */
export async function run(args: string[], deps: Deps): Promise<number> {
  const parsed = parseArgs(args);
  if (!parsed) {
    deps.out('usage: post-deploy-check <origin> --sha <commit> [--timeout-minutes N]');
    return 2;
  }
  const { origin, sha, minutes } = parsed;
  const get = (path: string) =>
    deps.fetch(origin + path, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000), // a hung connection must not outlast --timeout-minutes
    });
  const json = async (path: string) => {
    const res = await get(path);
    const body = res.status === 200 ? ((await res.json()) as Record<string, unknown>) : null;
    return { res, body };
  };

  // Poll until the commit matches; a down or old deploy keeps trying until the deadline.
  const commitCheck = (path: string, ok: (b: Record<string, unknown>) => boolean) => async () => {
    const deadline = deps.now() + minutes * 60_000;
    let last: string;
    for (;;) {
      try {
        const { res, body } = await json(path);
        if (!body) last = `${path} answered ${res.status}`;
        else if (!ok(body)) last = `${path} reports commit ${String(body.commit)}, expected ${sha}`;
        else return;
      } catch (e) {
        last = `${path} unreachable: ${(e as Error).message}`;
      }
      if (deps.now() + POLL_MS > deadline)
        throw new Error(`${last} (gave up after ${minutes} min)`);
      await deps.sleep(POLL_MS);
    }
  };

  const checks: [string, () => Promise<void>][] = [
    ['api-commit', commitCheck('/api/health', (b) => b.ok === true && b.commit === sha)],
    ['web-commit', commitCheck('/version.json', (b) => b.commit === sha)],
    [
      'landing',
      async () => {
        const res = await get('/welcome');
        if (res.status !== 200) throw new Error(`/welcome answered ${res.status}`);
        if (!(res.headers.get('content-type') ?? '').includes('text/html'))
          throw new Error('/welcome is not text/html');
        if (!/<form[^>]*method="post"/.test(await res.text())) throw new Error('join form missing');
      },
    ],
    [
      'anonymous-refused',
      async () => {
        for (const path of ['/api/decks', '/api/me']) {
          const res = await get(path);
          const type = res.headers.get('content-type') ?? '';
          if (res.status !== 401 || !type.includes('application/problem+json'))
            throw new Error(`${path} answered ${res.status} ${type} to an anonymous request`);
        }
      },
    ],
    [
      'public-health',
      async () => {
        const { res, body } = await json('/api/health');
        if (!body) throw new Error(`/api/health answered ${res.status}`);
        if (body.migration == null) throw new Error('migration is null');
      },
    ],
  ];

  for (const [name, check] of checks) {
    try {
      await check();
      deps.out(`ok ${name}`);
    } catch (e) {
      deps.out(`FAIL ${name}: ${(e as Error).message}`);
      return 1;
    }
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run(process.argv.slice(2), {
    fetch,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: Date.now,
    out: (line) => console.log(line),
  });
}
