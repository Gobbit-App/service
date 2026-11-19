import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractCallbackLink, forRecipient, latestMessage } from './mailbox';

const msg = (ID: string, to: string, Created?: string) => ({ ID, To: [{ Address: to }], Created });

describe('extractCallbackLink', () => {
  const link = 'http://web.test/auth/callback?token=abc123';

  it('finds the first link in plain text', () => {
    expect(extractCallbackLink(`Sign in: ${link}\nor ${link}x`)).toBe(link);
  });

  it('finds the link in HTML and decodes &amp;', () => {
    const html = `<a href="http://web.test/auth/callback?next=%2F&amp;token=abc123">go</a>`;
    expect(extractCallbackLink(html)).toBe('http://web.test/auth/callback?next=%2F&token=abc123');
  });

  it('returns null when absent', () => {
    expect(extractCallbackLink('hello http://web.test/other?token=1')).toBeNull();
  });
});

describe('forRecipient', () => {
  it('never returns other users mail, matches case-insensitively, newest first', () => {
    const all = [
      msg('old', 'Me@Example.com', '2026-01-01T00:00:00Z'),
      msg('other', 'you@example.com', '2026-03-01T00:00:00Z'),
      msg('new', 'me@example.com', '2026-02-01T00:00:00Z'),
    ];
    expect(forRecipient(all, ' ME@example.com ').map((m) => m.ID)).toEqual(['new', 'old']);
  });
});

describe('latestMessage', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stub = (messages: unknown[]) => {
    const fetchMock = vi.fn(async (url: string) =>
      Response.json(
        url.includes('/search') ? { messages } : { ID: 'mine', To: [], Text: 't', HTML: 'h' },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('re-filters search results so another recipient is never returned', async () => {
    const f = stub([msg('theirs', 'other@example.com', '2026-05-01T00:00:00Z')]);
    expect(await latestMessage('http://mail.test', 'me@example.com')).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('fetches the newest message addressed to the user', async () => {
    const f = stub([
      msg('theirs', 'other@example.com', '2026-05-01T00:00:00Z'),
      msg('mine', 'me@example.com', '2026-04-01T00:00:00Z'),
    ]);
    expect((await latestMessage('http://mail.test', 'me@example.com'))?.ID).toBe('mine');
    expect(f).toHaveBeenLastCalledWith('http://mail.test/api/v1/message/mine');
  });
});
