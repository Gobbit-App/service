import { describe, expect, it } from 'vitest';
import { segmentText, type Segment } from './segment';

/** The detected segments only, as `kind:text`. */
const detected = (text: string) =>
  segmentText(text)
    .filter((segment) => segment.kind !== 'text')
    .map((segment) => `${segment.kind}:${segment.text}`);

const valueOf = (text: string) =>
  (
    segmentText(text).find((segment) => segment.kind !== 'text') as Exclude<
      Segment,
      { kind: 'text' }
    >
  )?.value;

describe('segmentText: phones (FR-026)', () => {
  it.each([
    ['Mum +30 697 349 6445', 'phone:+30 697 349 6445', '+306973496445'],
    ['call +972501234567 now', 'phone:+972501234567', '+972501234567'],
    ['office (03) 123-4567', 'phone:(03) 123-4567', '031234567'],
    ['050-123-4567', 'phone:050-123-4567', '0501234567'],
    ['050 123 4567', 'phone:050 123 4567', '0501234567'],
    ['555.123.4567', 'phone:555.123.4567', '5551234567'],
    ['+44 (20) 7946 0958', 'phone:+44 (20) 7946 0958', '+442079460958'],
  ])('%s', (text, segment, value) => {
    expect(detected(text)).toEqual([segment]);
    expect(valueOf(text)).toBe(value);
  });

  it('finds every phone in a list (SC-008)', () => {
    expect(detected('Dad: +30 697 349 6445\nMum: +30 694 111 2233\nHome: 210 555 0101')).toEqual([
      'phone:+30 697 349 6445',
      'phone:+30 694 111 2233',
      'phone:210 555 0101',
    ]);
  });

  it('never joins runs across a line break or a double space', () => {
    expect(detected('4821\n5532')).toEqual(['number:4821', 'number:5532']);
    expect(detected('4821  5532')).toEqual(['number:4821', 'number:5532']);
  });
});

describe('segmentText: numbers to copy', () => {
  it.each([
    ['Door code 4821', 'number:4821'],
    ['Booking ref 993120', 'number:993120'],
    // An unformatted run could be anything: copy, don't dial.
    ['0501234567', 'number:0501234567'],
    ['Total 1,250,000', 'number:1,250,000'],
    ['pi is 3.14159', 'number:3.14159'],
    ['Account 12-345', 'number:12-345'],
  ])('%s', (text, segment) => {
    expect(detected(text)).toEqual([segment]);
  });

  it('keeps the number as written for copying', () => {
    expect(valueOf('IBAN 1,250')).toBe('1,250');
  });

  it('treats a too-long formatted run as a number, not a phone', () => {
    expect(detected('1234 5678 9012 3456')).toEqual(['number:1234 5678 9012 3456']);
  });
});

describe('segmentText: skipped (FR-026)', () => {
  it.each([
    ['short numbers', 'Room 12, floor 3'],
    ['stand-alone years', 'since 2019, until 1999'],
    ['dates with slashes', 'on 12/05/2024'],
    ['dashed dates', '2024-05-12 and 12.05.2024'],
    ['times', 'at 10:30 or 18:45:00'],
    ['digits in a word', 'A4 paper, the 2nd floor, v1234, 123abc'],
    ['digits in another script', 'דירה42 and тест123'],
    ['plain text', 'Nothing to see here.'],
  ])('%s', (_label, text) => {
    expect(detected(text)).toEqual([]);
  });

  it('returns nothing for an empty string', () => {
    expect(segmentText('')).toEqual([]);
  });
});

describe('segmentText: web addresses and emails', () => {
  it('finds an email', () => {
    expect(segmentText('Write to ana@example.com today')).toEqual([
      { kind: 'text', text: 'Write to ' },
      { kind: 'email', text: 'ana@example.com', value: 'ana@example.com' },
      { kind: 'text', text: ' today' },
    ]);
  });

  it('finds a web address, with or without the scheme, as an http(s) URL', () => {
    expect(segmentText('see https://pizza.example/menu')).toContainEqual({
      kind: 'url',
      text: 'https://pizza.example/menu',
      value: 'https://pizza.example/menu',
    });
    expect(valueOf('see example.com/a')).toBe('http://example.com/a');
  });

  it('does not take digits inside an address or email as numbers', () => {
    expect(detected('https://shop.example/order/123456 or bob2024@example.com')).toEqual([
      'url:https://shop.example/order/123456',
      'email:bob2024@example.com',
    ]);
  });

  it('ignores ftp and schema-relative links', () => {
    expect(detected('ftp://files.example.com and //cdn.example.com')).not.toContainEqual(
      expect.stringMatching(/^url:(ftp|\/\/)/),
    );
  });

  it('detects phones and numbers around links', () => {
    expect(detected('Code 4821 at https://door.example, call +30 697 349 6445')).toEqual([
      'number:4821',
      'url:https://door.example',
      'phone:+30 697 349 6445',
    ]);
  });

  it('keeps all the text, in order', () => {
    const text = 'Call 050-123-4567 or mail a@b.co (code 4821).';
    expect(
      segmentText(text)
        .map((segment) => segment.text)
        .join(''),
    ).toBe(text);
  });
});
