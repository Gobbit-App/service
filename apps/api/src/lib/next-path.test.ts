import { describe, it, expect } from 'vitest';
import { safeNextPath } from './next-path';

describe('safeNextPath', () => {
  describe('accepts', () => {
    it.each(['/d/family', '/me?x=1', '/a#b'])('accepts %s', (path) => {
      expect(safeNextPath(path)).toBe(path);
    });
  });

  describe('rejects', () => {
    it.each([
      ['//evil.com', 'starts with //'],
      ['/\\evil.com', 'second char is backslash'],
      ['https://evil.com', 'absolute URL'],
      ['evil', 'relative without /'],
      ['', 'empty string'],
      ['/', 'bare slash'],
      [null, 'null'],
      [undefined, 'undefined'],
      ['/a\nb', 'contains newline'],
      ['/' + 'a'.repeat(512), '513 chars'],
    ])('rejects %s (%s)', (path, _reason) => {
      expect(safeNextPath(path as unknown as string | null | undefined)).toBeUndefined();
    });
  });
});
