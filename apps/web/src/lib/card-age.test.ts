import { describe, expect, it } from 'vitest';
import { cardAge } from './card-age';

describe('cardAge', () => {
  const now = new Date('2026-03-01T00:00:00.000Z');

  it('says Added when the card was never edited', () => {
    const at = '2026-02-08T00:00:00.000Z';
    const result = cardAge({ createdAt: at, updatedAt: at }, now);
    expect(result?.label).toBe('Added 3 weeks ago');
    expect(result?.at.toISOString()).toBe(at);
  });

  it('still says Added when the update came within a minute of creation', () => {
    const result = cardAge(
      { createdAt: '2026-02-28T00:00:00.000Z', updatedAt: '2026-02-28T00:00:30.000Z' },
      now,
    );
    expect(result?.label).toBe('Added yesterday');
  });

  it('says Edited with the update time when the card changed later', () => {
    const updatedAt = '2026-02-28T22:00:00.000Z';
    const result = cardAge({ createdAt: '2026-01-01T00:00:00.000Z', updatedAt }, now);
    expect(result?.label).toBe('Edited 2 hours ago');
    expect(result?.at.toISOString()).toBe(updatedAt);
  });

  it('falls back to Added when updatedAt is unparseable', () => {
    const result = cardAge({ createdAt: '2026-02-28T00:00:00.000Z', updatedAt: 'garbage' }, now);
    expect(result?.label).toBe('Added yesterday');
  });

  it('returns null when createdAt is unparseable', () => {
    expect(
      cardAge({ createdAt: 'garbage', updatedAt: '2026-02-28T00:00:00.000Z' }, now),
    ).toBeNull();
  });
});
