import { describe, expect, it } from 'vitest';
import { LOCKED_HOSTS, lockedHostOf } from './locked-hosts';

describe('lockedHostOf (D166)', () => {
  it.each([
    ['https://www.instagram.com/p/abc/', 'instagram.com', 'Instagram'],
    ['https://m.facebook.com/story.php?id=1', 'facebook.com', 'Facebook'],
    ['https://fb.watch/xyz/', 'fb.watch', 'Facebook'],
    ['https://vm.tiktok.com/abc/', 'tiktok.com', 'TikTok'],
    ['https://twitter.com/someone/status/1', 'twitter.com', 'X'],
    ['https://x.com/someone', 'x.com', 'X'],
    ['https://www.threads.net/@someone', 'threads.net', 'Threads'],
    ['https://www.linkedin.com/posts/abc', 'linkedin.com', 'LinkedIn'],
    ['http://instagram.com/p/abc', 'instagram.com', 'Instagram'],
  ])('matches %s', (url, host, label) => {
    expect(lockedHostOf(url)).toEqual({ host, label });
  });

  it('ignores case, a trailing dot and ports', () => {
    expect(lockedHostOf('https://WWW.Instagram.COM/p/abc')?.host).toBe('instagram.com');
    expect(lockedHostOf('https://www.instagram.com./p/abc')?.host).toBe('instagram.com');
    expect(lockedHostOf('https://www.facebook.com:8443/x')?.host).toBe('facebook.com');
  });

  it.each([
    'https://notinstagram.com/',
    'https://instagram.com.example.test/',
    'https://example.test/instagram.com',
    'https://xx.com/',
    'ftp://instagram.com/',
    'mailto:someone@instagram.com',
    'not a url',
    '',
  ])('does not match %s', (url) => {
    expect(lockedHostOf(url)).toBeNull();
  });

  it('labels every listed host', () => {
    for (const [host, label] of Object.entries(LOCKED_HOSTS)) {
      expect(lockedHostOf(`https://${host}/`)).toEqual({ host, label });
    }
  });
});
