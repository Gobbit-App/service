import { describe, expect, it } from 'vitest';
import { collapseDoubledScheme, normalizeUrlInput } from './url-input';

describe('normalizeUrlInput (D205)', () => {
  it.each([
    ['', ''],
    ['   ', ''],
    ['https://', ''],
    ['HTTP://', ''],
    ['  https://  ', ''],
    ['example.org', 'https://example.org'],
    ['  example.org  ', 'https://example.org'],
    ['www.example.org/a?b=1', 'https://www.example.org/a?b=1'],
    ['https://example.org', 'https://example.org'],
    ['http://example.org', 'http://example.org'],
    ['HTTPS://Example.org/A', 'https://Example.org/A'],
    ['Http://x.org', 'http://x.org'],
    ['https://https://example.org', 'https://example.org'],
    ['https://http://example.org', 'http://example.org'],
    ['//example.org/a', 'https://example.org/a'],
    ['localhost:3000', 'https://localhost:3000'],
    ['example.org:8080/a', 'https://example.org:8080/a'],
    ['mailto:a@b', 'mailto:a@b'],
    ['javascript:alert(1)', 'javascript:alert(1)'],
    ['ftp://x.org', 'ftp://x.org'],
    ['hello world', 'https://hello world'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeUrlInput(input)).toBe(expected);
  });
});

describe('collapseDoubledScheme', () => {
  it.each([
    ['https://https://x.org', 'https://x.org'],
    ['https://HTTPS://https://x.org', 'https://x.org'],
    ['https://x.org', 'https://x.org'],
    ['https://', 'https://'],
    ['example', 'example'],
  ])('%j → %j', (input, expected) => {
    expect(collapseDoubledScheme(input)).toBe(expected);
  });
});
