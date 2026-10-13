import { describe, expect, it } from 'vitest';
import { payloadText } from './payload-text';

describe('payloadText', () => {
  it('collects url and preview strings from a link payload in key order', () => {
    const payload = {
      url: 'https://example.com/a',
      preview: { title: 'Example', description: 'A short summary' },
    };
    expect(payloadText('link', payload)).toBe('https://example.com/a Example A short summary');
  });

  it('walks nested table rows arrays depth-first', () => {
    const payload = {
      title: 'Totals',
      rows: [
        ['alpha', 'beta'],
        ['gamma', { text: 'delta' }],
      ],
    };
    expect(payloadText('table', payload)).toBe('Totals alpha beta gamma delta');
  });

  it('skips publicId on image payloads but keeps alt and caption', () => {
    const payload = {
      publicId: 'folder/secret-id',
      alt: 'A cat on a mat',
      caption: 'Sleeping',
    };
    const text = payloadText('image', payload);
    expect(text).toBe('A cat on a mat Sleeping');
    expect(text).not.toContain('secret-id');
  });

  it('keeps publicId for non-image payloads', () => {
    expect(payloadText('text', { publicId: 'abc', body: 'hi' })).toBe('abc hi');
  });

  it('skips expression on calc payloads but keeps label and unit strings', () => {
    const payload = {
      expression: '2 + 2 * x',
      label: 'Total',
      unit: 'kg',
      result: 4,
    };
    const text = payloadText('calc', payload);
    expect(text).toBe('Total kg');
    expect(text).not.toContain('2 + 2');
  });

  it('keeps expression for non-calc payloads', () => {
    expect(payloadText('text', { expression: 'x+1' })).toBe('x+1');
  });

  it('ignores numbers, booleans, and null, including inside arrays', () => {
    const payload = {
      a: 1,
      b: null,
      c: true,
      d: 'kept',
      e: false,
      f: [1, null, 'also kept', 0],
    };
    expect(payloadText('text', payload)).toBe('kept also kept');
  });

  it('skips empty strings', () => {
    expect(payloadText('text', { a: '', b: 'only', c: '' })).toBe('only');
  });

  it('returns an empty string for non-object payloads', () => {
    expect(payloadText('text', null)).toBe('');
    expect(payloadText('text', 42)).toBe('');
    expect(payloadText('text', true)).toBe('');
  });
});
