import type { AppConfig } from '@gobbit/shared';
import { describe, expect, it } from 'vitest';
import {
  copyrightLine,
  releasedLabel,
  serverVersion,
  serviceCredits,
  SOURCE_URL,
  versionLabel,
} from './about-info';

const SHA = '4553f42aa1b2c3d4e5f60718293a4b5c6d7e8f90';

const config: Omit<AppConfig, 'commit'> = {
  cloudinaryCloudName: null,
  search: { semantic: false, ask: false },
  ingest: { enabled: false, emailDomain: null, shortcutUrl: null },
  analytics: null,
  push: null,
};

describe('versionLabel (D354)', () => {
  it('shortens a commit and links it to the source', () => {
    expect(versionLabel(SHA)).toEqual({ label: '4553f42', href: `${SOURCE_URL}/commit/${SHA}` });
  });

  it('names a local build without a link', () => {
    expect(versionLabel('dev')).toEqual({ label: 'Development build', href: null });
    expect(versionLabel('  ')).toEqual({ label: 'Development build', href: null });
  });
});

describe('serverVersion (D354)', () => {
  it('is null while the server runs the same commit or is unknown', () => {
    expect(serverVersion(SHA, SHA)).toBeNull();
    expect(serverVersion(SHA, undefined)).toBeNull();
  });

  it('shows the server commit when it differs', () => {
    expect(serverVersion('dev', SHA)?.label).toBe('4553f42');
  });
});

describe('releasedLabel and copyrightLine (D354)', () => {
  it('formats the build time for the locale', () => {
    expect(releasedLabel('2026-11-06T09:30:00.000Z', 'en-GB')).toMatch(/6 Nov 2026/);
  });

  it('gives null for an unreadable time', () => {
    expect(releasedLabel('not a date')).toBeNull();
  });

  it('dates the copyright by the build year, or leaves the year out', () => {
    expect(copyrightLine('2026-11-06T09:30:00.000Z')).toBe('© 2026 The Gobbit authors');
    expect(copyrightLine('')).toBe('© The Gobbit authors');
  });
});

describe('serviceCredits (D354)', () => {
  const keys = (c: Omit<AppConfig, 'commit'>) => serviceCredits(c).map((credit) => credit.key);

  it('always credits the video hosts, and nothing a bare server lacks', () => {
    expect(keys(config)).toEqual(['video']);
  });

  it('credits every configured provider, in a stable order', () => {
    expect(
      keys({
        cloudinaryCloudName: 'demo',
        search: { semantic: true, ask: false },
        ingest: { enabled: false, emailDomain: null, shortcutUrl: null },
        analytics: { siteId: 's', host: 'https://example.test' },
        push: { publicKey: 'k' },
      }),
    ).toEqual(['cloudinary', 'ai', 'video', 'push', 'umami']);
  });

  it('credits the AI providers when only ingestion is on', () => {
    expect(keys({ ...config, ingest: { ...config.ingest, enabled: true } })).toContain('ai');
  });
});
