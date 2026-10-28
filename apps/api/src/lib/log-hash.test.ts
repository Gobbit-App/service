import { describe, it, expect } from 'vitest';
import { createLogHash } from './log-hash';

describe('createLogHash (D239)', () => {
  const keyA = 'a'.repeat(32);
  const keyB = 'b'.repeat(32);

  it('is stable for one key and 16 hex characters long', () => {
    const hash = createLogHash(keyA);
    expect(hash('email', 'parent@example.test')).toBe(hash('email', 'parent@example.test'));
    expect(hash('ip', '203.0.113.7')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('differs across keys', () => {
    expect(createLogHash(keyA)('ip', '203.0.113.7')).not.toBe(
      createLogHash(keyB)('ip', '203.0.113.7'),
    );
  });

  it('normalizes emails before hashing', () => {
    const hash = createLogHash(keyA);
    expect(hash('email', 'Parent@Example.TEST ')).toBe(hash('email', 'parent@example.test'));
  });

  it('never contains the value itself', () => {
    expect(createLogHash(keyA)('email', 'parent@example.test')).not.toContain('parent');
  });

  it('refuses an empty key', () => {
    expect(() => createLogHash('')).toThrow(/key is required/);
  });
});
