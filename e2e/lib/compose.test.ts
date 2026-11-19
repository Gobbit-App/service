import { describe, it, expect } from 'vitest';
import {
  composeBase,
  downArgs,
  freePorts,
  lastJournalTag,
  logsArgs,
  projectName,
  selectStale,
  upArgs,
} from './compose';
import { PROJECT_PREFIX, STALE_AFTER_MS } from './stack-config';

const files = { infraDir: '/repo/infra/', envFile: '/tmp/x/compose.env' };

describe('projectName', () => {
  it('has the documented format', () => {
    expect(projectName()).toMatch(/^gobbit-e2e-[a-z0-9]+-[a-z0-9]{4}$/);
  });

  it('differs by suffix and by clock', () => {
    expect(projectName(1000, 'aaaa')).not.toBe(projectName(1000, 'bbbb'));
    expect(projectName(1000, 'aaaa')).not.toBe(projectName(2000, 'aaaa'));
    expect(projectName(1000, 'aaaa')).toBe(`gobbit-e2e-${(1000).toString(36)}-aaaa`);
  });
});

describe('freePorts', () => {
  it('returns distinct ports', async () => {
    const ports = await freePorts(2);
    expect(ports).toHaveLength(2);
    expect(new Set(ports).size).toBe(2);
    for (const p of ports) expect(p).toBeGreaterThan(0);
  });
});

describe('compose argv', () => {
  const all = [
    composeBase('p', files),
    upArgs('p', files),
    upArgs('p', files, { build: false }),
    downArgs('p', files),
    logsArgs('p', files),
  ];

  it('never contains a seed step (FR-011)', () => {
    for (const argv of all) expect(argv.join(' ')).not.toMatch(/seed/i);
  });

  it('names the project, the three files and the env file', () => {
    const argv = composeBase('p', files);
    expect(argv.slice(0, 3)).toEqual(['compose', '-p', 'p']);
    const fs = argv.flatMap((a, i) => (a === '-f' ? [argv[i + 1]] : []));
    expect(fs).toEqual([
      '/repo/infra/docker-compose.yml',
      '/repo/infra/docker-compose.local.yml',
      '/repo/infra/docker-compose.e2e.yml',
    ]);
    expect(argv[argv.indexOf('--env-file') + 1]).toBe(files.envFile);
  });

  it('builds unless told not to', () => {
    expect(upArgs('p', files)).toContain('--build');
    expect(upArgs('p', files, { build: false })).not.toContain('--build');
  });
});

describe('selectStale', () => {
  const now = 10_000_000_000_000;
  const at = (ms: number) => projectName(ms, 'abcd');

  it('removes only our stale projects', () => {
    const old = at(now - STALE_AFTER_MS - 1);
    const fresh = at(now - STALE_AFTER_MS + 60_000);
    const names = [old, fresh, 'gobbit', 'infra', 'other-project', 'gobbit-e2e-notours'];
    expect(selectStale(names, now)).toEqual([old]);
  });

  it('with all, removes every one of ours but nothing else', () => {
    const fresh = at(now);
    expect(selectStale([fresh, 'infra', 'gobbit-dev'], now, { all: true })).toEqual([fresh]);
  });

  it('prefix constant matches the name format', () => {
    expect(projectName(1, 'abcd').startsWith(PROJECT_PREFIX)).toBe(true);
  });
});

describe('lastJournalTag', () => {
  it('returns the last entry tag', () => {
    const j = JSON.stringify({ entries: [{ tag: '0000_a' }, { tag: '0001_b' }] });
    expect(lastJournalTag(j)).toBe('0001_b');
  });

  it('throws on an empty journal', () => {
    expect(() => lastJournalTag(JSON.stringify({ entries: [] }))).toThrow();
  });
});
