import type { ReviewEntry } from '@pb/shared';
import { describe, expect, it } from 'vitest';
import { sourceLine } from './source-line';

type ReviewJob = NonNullable<ReviewEntry['job']>;

const NOW = new Date('2026-01-01T12:00:00.000Z');

function makeJob(overrides: Partial<ReviewJob>): ReviewJob {
  return {
    id: 'j',
    channel: 'pwa',
    sharedBy: null,
    clientLabel: null,
    createdAt: '2026-01-01T11:58:00.000Z',
    dedup: null,
    newCategory: null,
    sourcePreview: null,
    ...overrides,
  };
}

describe('sourceLine (D107)', () => {
  it('returns null when there is no job', () => {
    expect(sourceLine(null, NOW)).toBeNull();
  });

  it('formats sharer, channel label and relative time', () => {
    const job = makeJob({
      channel: 'shortcut',
      sharedBy: { id: 'u', displayName: 'Dana' },
      createdAt: '2026-01-01T11:58:00.000Z',
    });
    expect(sourceLine(job, NOW)).toBe('shared by Dana via Shortcut · 2 minutes ago');
  });

  it('falls back to "shared" when sharedBy is null and leaves out nothing else', () => {
    const job = makeJob({
      channel: 'pwa',
      sharedBy: null,
      createdAt: '2026-01-01T09:00:00.000Z',
    });
    expect(sourceLine(job, NOW)).toBe('shared via Share · 3 hours ago');
  });

  it('uses the lowercase "email" label for the email channel', () => {
    const job = makeJob({
      channel: 'email',
      sharedBy: null,
      createdAt: '2026-01-01T09:00:00.000Z',
    });
    expect(sourceLine(job, NOW)).toContain('via email');
  });

  it("leads the AI app label with the app's name (P5.9)", () => {
    const job = makeJob({
      channel: 'mcp',
      clientLabel: 'Claude',
      sharedBy: { id: 'u', displayName: 'Dana' },
    });
    expect(sourceLine(job, NOW)).toBe('shared by Dana via Claude (AI app) · 2 minutes ago');
    expect(sourceLine(makeJob({ channel: 'mcp' }), NOW)).toContain('via AI app');
  });

  it("leads the Imported label with the import's label (D190)", () => {
    const job = makeJob({
      channel: 'import',
      clientLabel: 'Street notes.md',
      sharedBy: { id: 'u', displayName: 'Dana' },
    });
    expect(sourceLine(job, NOW)).toBe(
      'shared by Dana via Street notes.md (Imported) · 2 minutes ago',
    );
  });

  it('omits the time part when createdAt is invalid', () => {
    const job = makeJob({
      channel: 'paste',
      sharedBy: { id: 'u', displayName: 'Dana' },
      createdAt: 'nope',
    });
    const line = sourceLine(job, NOW);
    expect(line).toBe('shared by Dana via paste');
    expect(line).not.toContain(' · ');
  });
});
