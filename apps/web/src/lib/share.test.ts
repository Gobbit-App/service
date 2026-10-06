import { describe, it, expect, vi } from 'vitest';
import { shareUrl, shareItem, type ShareNavigator } from './share';

describe('shareUrl', () => {
  it('constructs a shareable URL', () => {
    const url = shareUrl('https://example.com', 'item123');
    expect(url).toBe('https://example.com/s/item123');
  });

  it('trims a trailing slash from origin', () => {
    const url = shareUrl('https://example.com/', 'item123');
    expect(url).toBe('https://example.com/s/item123');
  });

  it('encodes the item ID', () => {
    const url = shareUrl('https://example.com', 'item with spaces');
    expect(url).toBe('https://example.com/s/item%20with%20spaces');
  });
});

describe('shareItem', () => {
  it('returns "shared" when nav.share succeeds', async () => {
    const nav: ShareNavigator = {
      share: vi.fn().mockResolvedValue(undefined),
    };
    const outcome = await shareItem({ url: 'https://example.com/s/123' }, nav);
    expect(outcome).toBe('shared');
    expect(nav.share).toHaveBeenCalledWith({ url: 'https://example.com/s/123' });
  });

  it('returns "cancelled" on AbortError and does not call clipboard', async () => {
    const clipboardMock = vi.fn();
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    const nav: ShareNavigator = {
      share: vi.fn().mockRejectedValue(abortError),
      clipboard: { writeText: clipboardMock },
    };
    const outcome = await shareItem({ url: 'https://example.com/s/123' }, nav);
    expect(outcome).toBe('cancelled');
    expect(clipboardMock).not.toHaveBeenCalled();
  });

  it('falls back to clipboard on NotAllowedError', async () => {
    const notAllowedError = new Error('Not allowed');
    notAllowedError.name = 'NotAllowedError';
    const nav: ShareNavigator = {
      share: vi.fn().mockRejectedValue(notAllowedError),
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    };
    const outcome = await shareItem({ url: 'https://example.com/s/123' }, nav);
    expect(outcome).toBe('copied');
    expect(nav.clipboard!.writeText).toHaveBeenCalledWith('https://example.com/s/123');
  });

  it('returns "copied" when nav.share is absent', async () => {
    const nav: ShareNavigator = {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    };
    const outcome = await shareItem({ url: 'https://example.com/s/123' }, nav);
    expect(outcome).toBe('copied');
  });

  it('returns "failed" when nav.share and nav.clipboard are absent', async () => {
    const nav: ShareNavigator = {};
    const outcome = await shareItem({ url: 'https://example.com/s/123' }, nav);
    expect(outcome).toBe('failed');
  });

  it('returns "failed" when clipboard.writeText rejects', async () => {
    const nav: ShareNavigator = {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('Clipboard access denied')),
      },
    };
    const outcome = await shareItem({ url: 'https://example.com/s/123' }, nav);
    expect(outcome).toBe('failed');
  });

  it('never throws', async () => {
    const nav: ShareNavigator = {
      share: vi.fn().mockRejectedValue(new Error('Unexpected error')),
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('Clipboard failed')),
      },
    };
    const outcome = await shareItem({ url: 'https://example.com/s/123' }, nav);
    expect(outcome).toBe('failed');
  });

  it('passes title to nav.share when provided', async () => {
    const nav: ShareNavigator = {
      share: vi.fn().mockResolvedValue(undefined),
    };
    await shareItem({ url: 'https://example.com/s/123', title: 'My Item' }, nav);
    expect(nav.share).toHaveBeenCalledWith({
      url: 'https://example.com/s/123',
      title: 'My Item',
    });
  });
});
