import { describe, expect, it } from 'vitest';
import { waitlistKinds } from '../enums';
import { waitlistJoinSchema } from './waitlist';

const base = { email: 'parent@example.test', kind: 'family' } as const;

describe('waitlistJoinSchema (D217)', () => {
  it.each(waitlistKinds)('accepts kind %s', (kind) => {
    expect(waitlistJoinSchema.safeParse({ ...base, kind }).success).toBe(true);
  });

  it('rejects an unknown kind', () => {
    expect(waitlistJoinSchema.safeParse({ ...base, kind: 'school' }).success).toBe(false);
  });

  it('accepts a 500 code point note and rejects 501, counting an emoji once', () => {
    const ok = waitlistJoinSchema.safeParse({ ...base, note: '😀'.repeat(500) });
    expect(ok.success).toBe(true);
    expect(waitlistJoinSchema.safeParse({ ...base, note: '😀'.repeat(501) }).success).toBe(false);
  });

  it('treats an empty or blank note as absent', () => {
    const parsed = waitlistJoinSchema.parse({ ...base, note: '   ' });
    expect(parsed.note).toBeUndefined();
  });

  it('trims the note', () => {
    expect(waitlistJoinSchema.parse({ ...base, note: '  clinic numbers ' }).note).toBe(
      'clinic numbers',
    );
  });

  it('trims and lower-cases the email', () => {
    const parsed = waitlistJoinSchema.parse({ ...base, email: '  Parent@Example.TEST ' });
    expect(parsed.email).toBe('parent@example.test');
  });

  it('rejects a malformed email', () => {
    expect(waitlistJoinSchema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false);
  });

  it('lower-cases a utm tag and drops an invalid one without failing', () => {
    expect(waitlistJoinSchema.parse({ ...base, utmSource: 'School-Group' }).utmSource).toBe(
      'school-group',
    );
    const dropped = waitlistJoinSchema.safeParse({ ...base, utmSource: 'bad tag!' });
    expect(dropped.success).toBe(true);
    expect(dropped.data?.utmSource).toBeUndefined();
    expect(waitlistJoinSchema.parse({ ...base, utmSource: 'a'.repeat(65) }).utmSource).toBe(
      undefined,
    );
  });

  it('rejects unknown fields', () => {
    expect(waitlistJoinSchema.safeParse({ ...base, admin: true }).success).toBe(false);
  });

  it('accepts the website honeypot field', () => {
    expect(waitlistJoinSchema.parse({ ...base, website: 'https://spam.test' }).website).toBe(
      'https://spam.test',
    );
  });
});
