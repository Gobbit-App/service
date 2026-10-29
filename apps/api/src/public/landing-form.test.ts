import { describe, expect, it } from 'vitest';
import { LANDING_COPY_EN } from './landing-copy';
import { landingUtmSource, parseLandingForm } from './landing-form';

const valid = { email: 'Visitor@Example.test ', kind: 'family' };

describe('parseLandingForm (D228)', () => {
  it('maps the urlencoded fields to the waitlist join input', () => {
    const result = parseLandingForm({
      ...valid,
      note: '  Our building  ',
      utm_source: 'WhatsApp',
      website: '',
    });
    expect(result).toEqual({
      ok: true,
      input: {
        email: 'visitor@example.test',
        kind: 'family',
        note: 'Our building',
        utmSource: 'whatsapp',
        website: '',
      },
      values: {
        email: 'Visitor@Example.test ',
        kind: 'family',
        note: '  Our building  ',
        utmSource: 'whatsapp',
      },
    });
  });

  it('omits a blank note and drops a malformed utm tag silently', () => {
    const result = parseLandingForm({ ...valid, note: '   ', utm_source: 'not a tag!' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.note).toBeUndefined();
    expect(result.input.utmSource).toBeUndefined();
  });

  it('ignores unknown fields and non-string values', () => {
    const result = parseLandingForm({ ...valid, admin: 'yes', note: new Blob(['x']) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input).not.toHaveProperty('admin');
    expect(result.input.note).toBeUndefined();
  });

  it('passes the honeypot through for 028 to drop', () => {
    const result = parseLandingForm({ ...valid, website: 'https://spam.example' });
    expect(result.ok && result.input.website).toBe('https://spam.example');
  });

  it('cuts an oversized honeypot instead of failing the form', () => {
    expect(parseLandingForm({ ...valid, website: 'x'.repeat(1000) }).ok).toBe(true);
  });

  it('gives one copy message per failing field and keeps the typed values', () => {
    const result = parseLandingForm({ email: 'nope', kind: 'aliens', note: 'n'.repeat(501) });
    expect(result).toEqual({
      ok: false,
      values: { email: 'nope', kind: undefined, note: 'n'.repeat(501), utmSource: undefined },
      errors: {
        email: LANDING_COPY_EN.errors.email,
        kind: LANDING_COPY_EN.errors.kind,
        note: LANDING_COPY_EN.errors.noteTooLong,
      },
    });
  });

  it('an empty body (e.g. a JSON post) fails on email and kind', () => {
    const result = parseLandingForm({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(['email', 'kind']);
  });
});

describe('landingUtmSource', () => {
  it('normalizes a valid tag and rejects anything else', () => {
    expect(landingUtmSource('Newsletter')).toBe('newsletter');
    expect(landingUtmSource('a b')).toBeUndefined();
    expect(landingUtmSource('x'.repeat(65))).toBeUndefined();
    expect(landingUtmSource(undefined)).toBeUndefined();
    expect(landingUtmSource('')).toBeUndefined();
  });
});
