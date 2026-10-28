import { describe, expect, it } from 'vitest';
import { confirmLocation } from './waitlist';

describe('confirmLocation (D218)', () => {
  it('lands a confirmed link on /welcome?confirmed=1', () => {
    expect(confirmLocation('https://app.example.test', true)).toBe(
      'https://app.example.test/welcome?confirmed=1',
    );
  });

  it('lands any invalid link on /welcome?confirm=invalid', () => {
    expect(confirmLocation('https://app.example.test', false)).toBe(
      'https://app.example.test/welcome?confirm=invalid',
    );
  });

  it('is null without APP_URL (the route answers JSON)', () => {
    expect(confirmLocation(undefined, true)).toBeNull();
  });
});
