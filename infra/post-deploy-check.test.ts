import { describe, expect, it } from 'vitest';
import { run } from './post-deploy-check';

const SHA = 'abc123';
const O = 'https://x.test';
const json = (body: unknown, status = 200, type = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });

type Routes = Record<string, () => Response>;
const healthy = (): Routes => ({
  '/api/health': () => json({ ok: true, db_ms: 1, migration: '0001', commit: SHA }),
  '/version.json': () => json({ commit: SHA }),
  '/welcome': () =>
    new Response('<form class="join" method="post" action="/welcome"></form>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
  '/api/decks': () => json({ title: 'Unauthorized' }, 401, 'application/problem+json'),
  '/api/me': () => json({ title: 'Unauthorized' }, 401, 'application/problem+json'),
});

async function check(routes: Routes, args = [O, '--sha', SHA, '--timeout-minutes', '1']) {
  const out: string[] = [];
  const methods: string[] = [];
  let t = 0;
  const code = await run(args, {
    fetch: (async (url: string, init?: RequestInit) => {
      methods.push(init?.method ?? 'GET');
      const handler = routes[new URL(url).pathname];
      if (!handler) throw new Error('ECONNREFUSED');
      return handler();
    }) as unknown as typeof fetch,
    sleep: async (ms) => void (t += ms),
    now: () => t,
    out: (l) => out.push(l),
  });
  return { code, out, methods };
}

describe('post-deploy-check', () => {
  it('passes when healthy, GET only', async () => {
    const { code, out, methods } = await check(healthy());
    expect(code).toBe(0);
    expect(out).toEqual([
      'ok api-commit',
      'ok web-commit',
      'ok landing',
      'ok anonymous-refused',
      'ok public-health',
    ]);
    expect(new Set(methods)).toEqual(new Set(['GET']));
  });

  it('fails api-commit on the wrong commit after the timeout', async () => {
    const r = healthy();
    r['/api/health'] = () => json({ ok: true, migration: 'm', commit: 'old' });
    const { code, out } = await check(r);
    expect(code).toBe(1);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^FAIL api-commit: /);
  });

  it('fails when the deploy is down', async () => {
    const { code, out } = await check({});
    expect(code).toBe(1);
    expect(out[0]).toMatch(/^FAIL api-commit: .*unreachable/);
  });

  it('polls until the new commit appears', async () => {
    const r = healthy();
    let n = 0;
    r['/api/health'] = () => json({ ok: true, migration: 'm', commit: ++n < 3 ? 'old' : SHA });
    expect((await check(r)).code).toBe(0);
  });

  for (const path of ['/api/decks', '/api/me']) {
    it(`fails anonymous-refused when ${path} answers 200`, async () => {
      const r = healthy();
      r[path] = () => json([]);
      const { code, out } = await check(r);
      expect(code).toBe(1);
      expect(out.at(-1)).toMatch(/^FAIL anonymous-refused: /);
    });
  }

  it('fails landing without the join form', async () => {
    const r = healthy();
    r['/welcome'] = () => new Response('<p>hi</p>', { headers: { 'content-type': 'text/html' } });
    const { code, out } = await check(r);
    expect(code).toBe(1);
    expect(out.at(-1)).toMatch(/^FAIL landing: /);
  });

  it('fails public-health when no migration is reported', async () => {
    const r = healthy();
    r['/api/health'] = () => json({ ok: true, migration: null, commit: SHA });
    const { out } = await check(r);
    expect(out.at(-1)).toMatch(/^FAIL public-health: /);
  });

  it.each([[[]], [[O]], [[O, '--sha']], [['nope', '--sha', SHA]], [[O, '--sha', SHA, '--x', '1']]])(
    'exits 2 on bad arguments %j',
    async (args) => {
      expect((await check(healthy(), args)).code).toBe(2);
    },
  );
});
