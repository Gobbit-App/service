// Self-contained e2e runner (047, contracts/runner.md): stack up, Playwright, logs, teardown.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  docker,
  downArgs,
  freePorts,
  logsArgs,
  projectName,
  readLastJournalTag,
  reap,
  upArgs,
  waitForStack,
  type ComposeFiles,
} from './lib/compose';
import { ADMIN_EMAIL, CLOUDINARY_DUMMY } from './lib/stack-config';

/** Single place to switch the Playwright config (T043). */
const PLAYWRIGHT_CONFIG = 'playwright.isolated.config.ts';
const MIN_COMPOSE = [2, 24] as const;

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const stackDir = `${root}/e2e/.stack`;
const files: ComposeFiles = { infraDir: `${root}/infra`, envFile: `${stackDir}/compose.env` };
const stackJson = `${stackDir}/stack.json`;

const argv = process.argv.slice(2);
const has = (f: string): boolean => argv.includes(f);
const passthrough = argv.filter((a) => !['--no-build', '--keep', '--clean', '--'].includes(a));
const keep = has('--keep');

let project = '';
let up = false;
let cleaned = false;
let current: ChildProcess | undefined;

/** Idempotent teardown; logs are saved only for a failed or interrupted run. */
async function cleanup(failed: boolean): Promise<void> {
  if (cleaned || !up) return;
  cleaned = true;
  if (failed) {
    const r = await docker(logsArgs(project, files));
    writeFileSync(`${stackDir}/stack.log`, r.stdout + r.stderr);
  }
  if (keep) {
    console.log(
      `Stack kept: ${project}\nRemove it with: docker compose -p ${project} down -v --remove-orphans`,
    );
    return;
  }
  await docker(downArgs(project, files));
  rmSync(stackJson, { force: true });
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    current?.kill(sig);
    void cleanup(true).then(() => process.exit(130));
  });
}

function writeEnv(webPort: number, mailboxPort: number): void {
  const webUrl = `http://127.0.0.1:${webPort}`;
  const { cloudName, apiKey, apiSecret } = CLOUDINARY_DUMMY;
  const vars = {
    WEB_PORT: webPort,
    MAILBOX_PORT: mailboxPort,
    API_URL: `${webUrl}/api`,
    APP_URL: webUrl,
    CLOUDINARY_URL: `cloudinary://${apiKey}:${encodeURIComponent(apiSecret)}@${cloudName}`,
    PLATFORM_ADMINS: ADMIN_EMAIL,
    LOG_HASH_KEY: randomBytes(32).toString('hex'),
  };
  writeFileSync(
    files.envFile,
    Object.entries(vars)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n',
  );
}

/** `compose up`, retried once with new ports on a bind error. Returns the two ports. */
async function start(): Promise<{ webPort: number; mailboxPort: number }> {
  for (let attempt = 1; ; attempt++) {
    const [webPort, mailboxPort] = (await freePorts(2)) as [number, number];
    writeEnv(webPort, mailboxPort);
    up = true;
    const r = await docker(upArgs(project, files, { build: !has('--no-build') }), { cwd: root });
    process.stderr.write(r.stdout + r.stderr);
    if (r.code === 0) return { webPort, mailboxPort };
    if (attempt === 1 && /port is already allocated|address already in use|bind/i.test(r.stderr)) {
      await docker(downArgs(project, files));
      continue;
    }
    throw new Error(`docker compose up failed (exit ${r.code})`);
  }
}

function runPlaywright(): Promise<number> {
  return new Promise((resolve) => {
    current = spawn(
      'pnpm',
      ['--filter', 'e2e', 'exec', 'playwright', 'test', '-c', PLAYWRIGHT_CONFIG, ...passthrough],
      { cwd: root, stdio: 'inherit' },
    );
    current.on('error', () => resolve(1));
    current.on('close', (code) => resolve(code ?? 1));
  });
}

async function main(): Promise<number> {
  const v = await docker(['compose', 'version', '--short']);
  const [maj = 0, min = 0] = v.stdout.trim().replace(/^v/, '').split('.').map(Number);
  if (v.code !== 0 || maj < MIN_COMPOSE[0] || (maj === MIN_COMPOSE[0] && min < MIN_COMPOSE[1])) {
    console.error('Docker Compose ≥ 2.24 is required (and docker must be on PATH).');
    return 2;
  }
  const reaped = await reap({ all: has('--clean') });
  if (reaped.length) console.log(`Removed stale stacks: ${reaped.join(', ')}`);
  if (has('--clean')) return 0;

  mkdirSync(stackDir, { recursive: true });
  project = projectName();
  let code = 3;
  try {
    const { webPort, mailboxPort } = await start();
    const webUrl = `http://127.0.0.1:${webPort}`;
    await waitForStack(webUrl, {
      expectedMigration: readLastJournalTag(`${root}/packages/db/migrations/meta/_journal.json`),
    });
    writeFileSync(
      stackJson,
      JSON.stringify(
        {
          project,
          webUrl,
          apiUrl: `${webUrl}/api`,
          mailboxUrl: `http://127.0.0.1:${mailboxPort}`,
          startedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    code = await runPlaywright();
  } catch (e) {
    console.error(`Stack failed to start: ${(e as Error).message}`);
  } finally {
    await cleanup(code !== 0);
  }
  return code === 0 ? 0 : code === 3 ? 3 : 1;
}

process.exit(await main());
