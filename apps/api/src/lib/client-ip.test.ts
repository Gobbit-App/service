import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { clientIp, type ConnInfoFn } from './client-ip';

describe('clientIp', () => {
  const createTestApp = (headerName?: string, connInfoFn?: ConnInfoFn) => {
    const app = new Hono();
    app.get('/', (c) => {
      const ip = clientIp(c, headerName, connInfoFn);
      return c.text(ip);
    });
    return app;
  };

  it('should return conn address when no header configured', async () => {
    const fakeConnInfo: ConnInfoFn = () => ({
      remote: { address: '192.168.1.1' },
    });
    const app = createTestApp(undefined, fakeConnInfo);
    const res = await app.request('/', { method: 'GET' });
    expect(await res.text()).toBe('192.168.1.1');
  });

  it('should return header value when configured and present', async () => {
    const fakeConnInfo: ConnInfoFn = () => ({
      remote: { address: '192.168.1.1' },
    });
    const app = createTestApp('cf-connecting-ip', fakeConnInfo);
    const res = await app.request('/', {
      method: 'GET',
      headers: { 'cf-connecting-ip': '10.0.0.1' },
    });
    expect(await res.text()).toBe('10.0.0.1');
  });

  it('should return first comma-separated part of header', async () => {
    const fakeConnInfo: ConnInfoFn = () => ({
      remote: { address: '192.168.1.1' },
    });
    const app = createTestApp('x-forwarded-for', fakeConnInfo);
    const res = await app.request('/', {
      method: 'GET',
      headers: { 'x-forwarded-for': 'a, b' },
    });
    expect(await res.text()).toBe('a');
  });

  it('should fall back to connInfo when configured header is absent', async () => {
    const fakeConnInfo: ConnInfoFn = () => ({
      remote: { address: '192.168.1.1' },
    });
    const app = createTestApp('cf-connecting-ip', fakeConnInfo);
    const res = await app.request('/', { method: 'GET' });
    expect(await res.text()).toBe('192.168.1.1');
  });

  it('should ignore X-Forwarded-For when not configured', async () => {
    const fakeConnInfo: ConnInfoFn = () => ({
      remote: { address: '192.168.1.1' },
    });
    const app = createTestApp('cf-connecting-ip', fakeConnInfo);
    const res = await app.request('/', {
      method: 'GET',
      headers: { 'x-forwarded-for': '10.0.0.2' },
    });
    expect(await res.text()).toBe('192.168.1.1');
  });

  it('should return unknown when connInfo throws', async () => {
    const fakeConnInfo: ConnInfoFn = () => {
      throw new Error('connInfo failed');
    };
    const app = createTestApp(undefined, fakeConnInfo);
    const res = await app.request('/', { method: 'GET' });
    expect(await res.text()).toBe('unknown');
  });
});
