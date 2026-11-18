// Docker Compose helpers for the e2e runner (047). Pure pieces are exported for unit tests; no env reads.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { randomInt } from 'node:crypto';
import { PROJECT_PREFIX, STALE_AFTER_MS, TIMEOUTS } from './stack-config';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** `gobbit-e2e-<epoch ms base36>-<4 [a-z0-9]>`; clock and suffix are injectable. */
export function projectName(
  now: number = Date.now(),
  suffix: string = Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''),
): string {
  return `${PROJECT_PREFIX}${now.toString(36)}-${suffix}`;
}

/** Start time encoded in a project name, or null if it is not one of ours. */
export function projectStartedAt(name: string): number | null {
  const m = /^gobbit-e2e-([a-z0-9]+)-[a-z0-9]{4}$/.exec(name);
  if (!m) return null;
  const ms = parseInt(m[1]!, 36);
  return Number.isFinite(ms) ? ms : null;
}

/** Names to remove: ours only, and older than staleAfterMs (or all of ours when `all`). */
export function selectStale(
  names: readonly string[],
  now: number,
  opts: { all?: boolean; staleAfterMs?: number } = {},
): string[] {
  const max = opts.staleAfterMs ?? STALE_AFTER_MS;
  return names.filter((n) => {
    if (!n.startsWith(PROJECT_PREFIX)) return false;
    if (opts.all) return true;
    const t = projectStartedAt(n);
    return t !== null && now - t > max;
  });
}

export interface ComposeFiles {
  /** Repo `infra/` directory, absolute. */
  infraDir: string;
  /** Absolute path of the generated compose.env. */
  envFile: string;
}

/** Common `docker compose` args (after `docker`): project, three files, env file. No seed step (FR-011). */
export function composeBase(project: string, f: ComposeFiles): string[] {
  const dir = f.infraDir.replace(/\/$/, '');
  return [
    'compose',
    '-p',
    project,
    '-f',
    `${dir}/docker-compose.yml`,
    '-f',
    `${dir}/docker-compose.local.yml`,
    '-f',
    `${dir}/docker-compose.e2e.yml`,
    '--env-file',
    f.envFile,
  ];
}

export function upArgs(project: string, f: ComposeFiles, opts: { build?: boolean } = {}): string[] {
  return [
    ...composeBase(project, f),
    'up',
    '-d',
    ...(opts.build === false ? [] : ['--build']),
    '--wait',
    '--wait-timeout',
    String(TIMEOUTS.stackUpSeconds),
  ];
}

export const downArgs = (project: string, f: ComposeFiles): string[] => [
  ...composeBase(project, f),
  'down',
  '-v',
  '--remove-orphans',
];

export const logsArgs = (project: string, f: ComposeFiles): string[] => [
  ...composeBase(project, f),
  'logs',
  '--no-color',
  'api',
  'worker',
  'web',
  'mailpit',
];

/** Last migration tag in drizzle's `_journal.json` text. */
export function lastJournalTag(journalJson: string): string {
  const entries = (JSON.parse(journalJson) as { entries: { tag: string }[] }).entries;
  const tag = entries.at(-1)?.tag;
  if (!tag) throw new Error('migration journal has no entries');
  return tag;
}

export const readLastJournalTag = (journalPath: string): string =>
  lastJournalTag(readFileSync(journalPath, 'utf8'));

/** Ask the OS for `count` distinct free loopback ports (small race before compose binds them; caller retries once). */
export async function freePorts(count = 2): Promise<number[]> {
  const servers = await Promise.all(
    Array.from(
      { length: count },
      () =>
        new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
          const s = createServer();
          s.once('error', reject);
          s.listen(0, '127.0.0.1', () => resolve(s));
        }),
    ),
  );
  const ports = servers.map((s) => (s.address() as { port: number }).port);
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  return ports;
}

export interface WaitOpts {
  expectedMigration: string;
  timeoutMs?: number;
  intervalMs?: number;
  fetchFn?: typeof fetch;
}

/** Poll `<webUrl>/api/health` (ok + migration = expected) then `<webUrl>/version.json`. Throws on timeout. */
export async function waitForStack(webUrl: string, o: WaitOpts): Promise<void> {
  const f = o.fetchFn ?? fetch;
  const deadline = Date.now() + (o.timeoutMs ?? TIMEOUTS.healthSeconds * 1000);
  let last = 'no response';
  const ok = async (url: string, check?: (b: unknown) => string | null): Promise<boolean> => {
    try {
      const res = await f(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        last = `${url} -> ${res.status}`;
        return false;
      }
      const problem = check ? check(await res.json()) : null;
      if (problem) last = `${url}: ${problem}`;
      return !problem;
    } catch (e) {
      last = `${url}: ${(e as Error).message}`;
      return false;
    }
  };
  const health = (b: unknown): string | null => {
    const h = b as { ok?: boolean; migration?: string | null };
    if (!h.ok) return 'not ok';
    return h.migration === o.expectedMigration
      ? null
      : `migration ${h.migration} != ${o.expectedMigration}`;
  };
  while (Date.now() < deadline) {
    if (
      (await ok(`${webUrl}/api/health`, health)) &&
      (await ok(`${webUrl}/version.json`, () => null))
    )
      return;
    await new Promise((r) => setTimeout(r, o.intervalMs ?? 1000));
  }
  throw new Error(`stack not healthy in time (${last})`);
}

/** Run `docker <args>`; resolves with output and exit code, never rejects on non-zero. */
export function docker(
  args: string[],
  opts: { cwd?: string } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      'docker',
      args,
      { cwd: opts.cwd, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
        resolve({ code, stdout, stderr: err && code === 1 && !stderr ? err.message : stderr });
      },
    );
  });
}

/** Names of all compose projects (running or not). */
export async function listProjects(): Promise<string[]> {
  const r = await docker(['compose', 'ls', '-a', '--format', 'json']);
  if (r.code !== 0) return [];
  return (JSON.parse(r.stdout || '[]') as { Name: string }[]).map((p) => p.Name);
}

/** Remove stale `gobbit-e2e-*` projects (all of ours with `all`). Returns the names removed. */
export async function reap(opts: { all?: boolean; now?: number } = {}): Promise<string[]> {
  const victims = selectStale(await listProjects(), opts.now ?? Date.now(), { all: opts.all });
  // By project label only: the env file of a stale run is gone, so no -f files.
  await Promise.all(
    victims.map((p) => docker(['compose', '-p', p, 'down', '-v', '--remove-orphans'])),
  );
  return victims;
}
