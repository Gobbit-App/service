import { describe, expect, it, vi } from 'vitest';
import {
  openFromNotification,
  parsePushPayload,
  PENDING_CHANGED,
  PUSH_ICON,
  safeAppPath,
  showReminder,
  tellOpenWindows,
} from './sw-push';

const ORIGIN = 'https://gobbit.example';

describe('safeAppPath', () => {
  it.each([
    ['/i/abc', '/i/abc'],
    ['//evil.example/x', '/'],
    ['https://evil.example/', '/'],
    [42, '/'],
  ])('%s → %s', (input, out) => {
    expect(safeAppPath(input)).toBe(out);
  });
});

describe('parsePushPayload (037, D296)', () => {
  it('reads a reminder', () => {
    const msg = { title: 'Pay', body: 'Home · due 9:00', url: '/i/1', tag: 'i1' };
    expect(parsePushPayload(() => msg)).toEqual(msg);
  });

  it('falls back on a missing, broken or foreign payload', () => {
    expect(parsePushPayload(undefined).title).toBe('Gobbit');
    expect(
      parsePushPayload(() => {
        throw new SyntaxError('not json');
      }).title,
    ).toBe('Gobbit');
    expect(parsePushPayload(() => ({ title: 'X', url: 'https://evil.example' })).url).toBe('/');
  });
});

describe('showReminder', () => {
  it('shows one notification per tag with the link in data', async () => {
    const show = vi.fn(async () => undefined);
    await showReminder({ title: 'Pay', body: 'b', url: '/i/1', tag: 'i1' }, show);
    expect(show).toHaveBeenCalledWith('Pay', {
      body: 'b',
      tag: 'i1',
      icon: PUSH_ICON,
      badge: PUSH_ICON,
      data: { url: '/i/1' },
    });
  });
});

describe('openFromNotification', () => {
  it('opens a window when none is open', async () => {
    const open = vi.fn(async () => null);
    await openFromNotification({ url: '/i/1' }, { origin: ORIGIN, windows: async () => [], open });
    expect(open).toHaveBeenCalledWith(`${ORIGIN}/i/1`);
  });

  it('focuses an open Gobbit window and moves it to the card', async () => {
    const navigate = vi.fn(async () => null);
    const win = { url: `${ORIGIN}/d/home`, navigate, focus: vi.fn(async () => win) };
    const open = vi.fn();
    await openFromNotification(
      { url: '/i/1' },
      {
        origin: ORIGIN,
        windows: async () => [{ url: 'https://other.example/', focus: vi.fn() }, win],
        open,
      },
    );
    expect(win.focus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(`${ORIGIN}/i/1`);
    expect(open).not.toHaveBeenCalled();
  });

  it('never leaves the origin', async () => {
    const open = vi.fn(async () => null);
    await openFromNotification(
      { url: 'https://evil.example/' },
      { origin: ORIGIN, windows: async () => [], open },
    );
    expect(open).toHaveBeenCalledWith(`${ORIGIN}/`);
  });
});

describe('tellOpenWindows (037, FR-024)', () => {
  it('tells every open window the pending list changed', async () => {
    const a = { postMessage: vi.fn() };
    const b = { postMessage: vi.fn() };
    await tellOpenWindows(() => Promise.resolve([a, b]));
    expect(a.postMessage).toHaveBeenCalledWith({ type: PENDING_CHANGED });
    expect(b.postMessage).toHaveBeenCalledWith({ type: PENDING_CHANGED });
  });

  it('never throws, so the notification still shows', async () => {
    await expect(tellOpenWindows(() => Promise.reject(new Error('gone')))).resolves.toBeUndefined();
  });
});
