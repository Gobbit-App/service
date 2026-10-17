import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ARTICLE_PAGE } from '@pb/db/test/ingest-pages';
import { createSafeFetch } from './safe-fetch';
import { isBlockedAddress } from './ip-guard';

/** A local server stands in for the internet; loopback is allowed only for these tests. */
let server: Server;
let base: string;

const routes: Record<string, (res: import('node:http').ServerResponse) => void> = {
  '/article': (res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(ARTICLE_PAGE);
  },
  '/latin1': (res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=iso-8859-1' });
    res.end(Buffer.from('<title>Caf\xe9</title>', 'latin1'));
  },
  '/hop1': (res) => {
    res.writeHead(302, { location: '/hop2' });
    res.end();
  },
  '/hop2': (res) => {
    res.writeHead(301, { location: `${base}/article` });
    res.end();
  },
  '/loop': (res) => {
    res.writeHead(302, { location: '/loop' });
    res.end();
  },
  '/to-metadata': (res) => {
    res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
    res.end();
  },
  '/to-private-name': (res) => {
    res.writeHead(302, { location: 'http://internal.test/' });
    res.end();
  },
  '/pdf': (res) => {
    res.writeHead(200, { 'content-type': 'application/pdf' });
    res.end('%PDF-1.4');
  },
  '/big': (res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<title>Big</title>${'x'.repeat(50_000)}`);
  },
  '/slow': (res) => {
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<title>late</title>');
    }, 500);
  },
  '/missing': (res) => {
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end('nope');
  },
};

beforeAll(async () => {
  server = createServer((req, res) => {
    const handler = routes[req.url ?? ''];
    if (handler) handler(res);
    else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Loopback is reachable; everything else private stays blocked. */
const allowLoopback = (ip: string) => ip !== '127.0.0.1' && isBlockedAddress(ip);

const lookupAll = async (hostname: string) => {
  if (hostname === 'internal.test') return [{ address: '10.0.0.5', family: 4 }];
  if (hostname === 'localhost') return [{ address: '127.0.0.1', family: 4 }];
  throw new Error(`ENOTFOUND ${hostname}`);
};

const local = (extra: Parameters<typeof createSafeFetch>[0] = {}) =>
  createSafeFetch({ isBlocked: allowLoopback, allowedPorts: null, lookupAll, ...extra });

describe('createSafeFetch (D102)', () => {
  it('fetches and decodes an HTML page', async () => {
    const res = await local()(`${base}/article`);
    expect(res).toMatchObject({ status: 200, finalUrl: `${base}/article`, error: null });
    expect(res.html).toContain('Dan the Plumber');
    expect(res.ms).toBeGreaterThanOrEqual(0);
  });

  it('decodes the declared charset', async () => {
    const res = await local()(`${base}/latin1`);
    expect(res.html).toBe('<title>Café</title>');
  });

  it('follows up to the redirect limit and reports the final url', async () => {
    const res = await local()(`${base}/hop1`);
    expect(res.status).toBe(200);
    expect(res.finalUrl).toBe(`${base}/article`);
  });

  it('stops after too many redirects', async () => {
    const res = await local({ maxRedirects: 3 })(`${base}/loop`);
    expect(res.error).toBe('too_many_redirects');
    expect(res.html).toBeNull();
  });

  it('refuses a redirect to a metadata IP literal', async () => {
    const res = await local()(`${base}/to-metadata`);
    expect(res.error).toBe('blocked');
    expect(res.finalUrl).toBe('http://169.254.169.254/latest/meta-data/');
  });

  it('refuses a redirect to a name that resolves to a private address', async () => {
    const res = await local()(`${base}/to-private-name`);
    expect(res.error).toBe('blocked');
  });

  it('blocks loopback with the default guard (the production setting)', async () => {
    const res = await createSafeFetch({ allowedPorts: null })(`${base}/article`);
    expect(res.error).toBe('blocked');
    expect(res.html).toBeNull();
  });

  it('blocks a hostname resolving to loopback with the default guard', async () => {
    const port = new URL(base).port;
    const res = await createSafeFetch({ allowedPorts: null, lookupAll })(
      `http://localhost:${port}/article`,
    );
    expect(res.error).toBe('blocked');
  });

  it('allows only ports 80/443 by default', async () => {
    const res = await createSafeFetch({ isBlocked: allowLoopback, lookupAll })(`${base}/article`);
    expect(res.error).toBe('blocked');
  });

  it('refuses non-http schemes and credentials in the url', async () => {
    const f = local();
    expect((await f('file:///etc/passwd')).error).toBe('blocked');
    expect((await f('ftp://example.com/')).error).toBe('blocked');
    expect((await f(`http://user:pw@127.0.0.1:${new URL(base).port}/article`)).error).toBe(
      'blocked',
    );
  });

  it('rejects non-HTML responses', async () => {
    const res = await local()(`${base}/pdf`);
    expect(res).toMatchObject({ status: 200, html: null, error: 'not_html' });
  });

  it('truncates the body at the byte cap', async () => {
    const res = await local({ maxBytes: 1000 })(`${base}/big`);
    expect(res.error).toBeNull();
    expect(res.html?.length).toBe(1000);
    expect(res.html).toContain('<title>Big</title>');
  });

  it('times out slow servers', async () => {
    const res = await local({ timeoutMs: 100 })(`${base}/slow`);
    expect(res.error).toBe('timeout');
  });

  it('reports HTTP errors', async () => {
    const res = await local()(`${base}/missing`);
    expect(res).toMatchObject({ status: 404, html: null, error: 'http_404' });
  });

  it('never throws on a malformed url', async () => {
    const res = await local()('not a url');
    expect(res.error).toMatch(/^fetch_failed/);
    expect(res.finalUrl).toBeNull();
  });
});
