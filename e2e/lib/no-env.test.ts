import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const SKIP = new Set(['node_modules', '.stack', 'playwright-report', 'test-results']);
const SELF = resolve(__dirname, 'no-env.test.ts');

const bounded = (name: string) => new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`);
const ENV_ACCESS = [/\bprocess\.env\b/, /\bimport\.meta\.env\b/, /\bDeno\.env\b/];
const PROFILE = 'PROFILE_UPDATE_RATE_PER_HOUR'; // forbidden only in local/e2e compose files
const NAMES = [
  'SMOKE_SESSION_TOKEN',
  'E2E_MEMBER_B_TOKEN',
  'E2E_MEMBER_C_TOKEN',
  'SMOKE_INVITEE_USERNAME',
  'BASE_URL',
  'WEB_BASE_URL',
  'EXPECTED_SHA',
  'CLOUDINARY_API_SECRET',
  PROFILE,
].map((n) => [n, bounded(n)] as const);
const generic = NAMES.filter(([n]) => n !== PROFILE).map(([, r]) => r);
const profile = NAMES.filter(([n]) => n === PROFILE).map(([, r]) => r);

const walk = (dir: string, pick: (f: string) => boolean): string[] =>
  readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p, pick) : pick(p) ? [p] : [];
  });

const hits = (file: string, text: string, patterns: readonly RegExp[]) =>
  text
    .split('\n')
    .flatMap((line, i) =>
      patterns.some((re) => re.test(line))
        ? [`${relative(root, file)}:${i + 1}: ${line.trim()}`]
        : [],
    );

const read = (f: string) => readFileSync(f, 'utf8');
const isFile = (f: string) => {
  try {
    return statSync(f).isFile();
  } catch {
    return false;
  }
};

describe('patterns', () => {
  const m = (name: string, s: string) => NAMES.find(([n]) => n === name)![1].test(s);
  it('word-bounds names', () => {
    expect(m('BASE_URL', 'BASE_URL=x')).toBe(true);
    expect(m('BASE_URL', '${BASE_URL}')).toBe(true);
    expect(m('BASE_URL', 'API_BASE_URL')).toBe(false);
    expect(m('BASE_URL', 'WEB_BASE_URL')).toBe(false);
    expect(m('WEB_BASE_URL', 'WEB_BASE_URL')).toBe(true);
    expect(m('EXPECTED_SHA', 'MY_EXPECTED_SHAX')).toBe(false);
  });
  it('matches env access', () => {
    const any = (s: string) => ENV_ACCESS.some((re) => re.test(s));
    expect(any('const a = process.env.X')).toBe(true);
    expect(any('import.meta.env.DEV')).toBe(true);
    expect(any('Deno.env.get("A")')).toBe(true);
    expect(any('process.environment')).toBe(false);
  });
});

describe('e2e reads no environment', () => {
  const tsFiles = walk(join(root, 'e2e'), (f) => f.endsWith('.ts') && resolve(f) !== SELF);

  it('has no env access under e2e/', () => {
    expect(tsFiles.flatMap((f) => hits(f, read(f), ENV_ACCESS))).toEqual([]);
  });

  it('has no forbidden env names under e2e/', () => {
    expect(tsFiles.flatMap((f) => hits(f, read(f), [...generic, ...profile]))).toEqual([]);
  });

  it('has no forbidden env names in workflows, compose files or package scripts', () => {
    const out: string[] = [];

    for (const f of walk(join(root, '.github/workflows'), (p) => /\.ya?ml$/.test(p))) {
      out.push(...hits(f, read(f), generic));
    }
    for (const name of readdirSync(join(root, 'infra'))) {
      if (!/^docker-compose.*\.ya?ml$/.test(name)) continue;
      // the production default of the profile rate limit stays in docker-compose.yml
      const forbid = name === 'docker-compose.yml' ? generic : [...generic, ...profile];
      out.push(...hits(join(root, 'infra', name), read(join(root, 'infra', name)), forbid));
    }
    const pkgs = [
      join(root, 'package.json'),
      join(root, 'e2e/package.json'),
      ...readdirSync(join(root, 'apps')).map((a) => join(root, 'apps', a, 'package.json')),
    ].filter(isFile);
    for (const f of pkgs) {
      const scripts = (JSON.parse(read(f)).scripts ?? {}) as Record<string, string>;
      const text = Object.entries(scripts)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
      out.push(...hits(f, text, generic).map((h) => h.replace(/:\d+:/, ': scripts.')));
    }
    expect(out).toEqual([]);
  });
});
