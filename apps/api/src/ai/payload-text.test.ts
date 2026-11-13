import { describe, expect, it } from 'vitest';
import { payloadText } from './payload-text';

describe('payloadText', () => {
  it('D291: a reminder payload adds no text', () => {
    const payload = {
      deadline: '2026-11-04T09:00:00.000Z',
      showBefore: { amount: 1, unit: 'days' },
      dismiss: { mode: 'writers', userIds: [] },
      timeZone: 'Europe/London',
    };
    expect(payloadText('reminder', payload)).toBe('');
  });

  it('D372: an event adds its location and link text, never time, zone or notify', () => {
    const payload = {
      allDay: false,
      start: '2030-06-01T18:00:00+03:00',
      timeZone: 'Asia/Jerusalem',
      location: 'Town Hall',
      url: 'https://example.com/fair',
      preview: { title: 'Summer fair', description: 'Stalls', publicId: 'gobbit/x/secret' },
      notify: {
        before: [{ amount: 1, unit: 'days' }],
        audience: { mode: 'people', userIds: ['u1'] },
      },
    };
    expect(payloadText('event', payload)).toBe(
      'Town Hall https://example.com/fair Summer fair Stalls',
    );
    expect(payloadText('event', { allDay: true, start: '2030-06-01', timeZone: 'UTC' })).toBe('');
  });

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

  it('keeps every photo description of a media gallery, never ids or facts (D398)', () => {
    const payload = {
      kind: 'image',
      images: [
        { publicId: 'folder/secret-id', alt: 'A cat on a mat', width: 640, height: 480 },
        { publicId: 'folder/other', alt: '' },
        { publicId: 'folder/third', alt: 'Sleeping' },
      ],
    };
    const text = payloadText('media', payload);
    expect(text).toBe('A cat on a mat Sleeping');
    expect(text).not.toContain('secret-id');
  });

  it('keeps a file card’s description and file name (FR-029)', () => {
    expect(
      payloadText('media', {
        kind: 'pdf',
        publicId: 'folder/doc',
        alt: 'Term dates',
        pages: 3,
        fileName: 'calendar.pdf',
      }),
    ).toBe('Term dates calendar.pdf');
  });

  it('keeps publicId for non-media payloads', () => {
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
