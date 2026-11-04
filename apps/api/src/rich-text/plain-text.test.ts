import { describe, expect, it } from 'vitest';
import { stripStyleDirectives, toPlainText } from './plain-text';

describe('toPlainText (FR-017)', () => {
  it.each([
    ['# Heading', 'Heading'],
    ['- one\n- two', 'one two'],
    ['1. Numbered', 'Numbered'],
    ['**bold** and __strong__ and *em*', 'bold and strong and em'],
    ['[text](https://example.com)', 'text'],
    ['<https://example.com>', 'https://example.com'],
    ['![alt text](image.jpg)', 'alt text'],
    ['use `code` here', 'use code here'],
    ['```python\ncode\n```', 'code'],
    ['> Quote', 'Quote'],
    ['---', ''],
    ['<b>bold</b>', 'bold'],
    ['snake_case_name', 'snake_case_name'],
    ['~~strike~~', 'strike'],
    ['col1|col2', 'col1 col2'],
    ['|---|---|', ''],
  ])('%j → %j', (body, text) => {
    expect(toPlainText(body)).toBe(text);
  });

  it('turns breaks and paragraphs into single spaces', () => {
    expect(toPlainText('Milk\nEggs\n\n\nBread')).toBe('Milk Eggs Bread');
    expect(toPlainText('## Title\nText')).toBe('Title Text');
  });

  it('keeps labels of style directives and drops their syntax', () => {
    expect(toPlainText('A :u[b] :small[c] :large[:color[**d**]{.red}] e')).toBe('A b c d e');
  });

  it('keeps labels of unknown directives and label-less prose', () => {
    expect(toPlainText(':huge[hot] :color[x]{.pink} Re:Plan at 10:30')).toBe(
      'hot x Re:Plan at 10:30',
    );
  });

  it('separates blocks with one space', () => {
    expect(toPlainText('# A\n\nB')).toBe('A B');
  });
});

describe('stripStyleDirectives', () => {
  it('returns bodies without directives unchanged', () => {
    const body = '## Steps\n\n1. **First** at 10:30\n2. [Second](https://a.example/x)';
    expect(stripStyleDirectives(body)).toBe(body);
  });

  it('unwraps style directives and keeps the Markdown inside', () => {
    expect(stripStyleDirectives('A :u[b] :color[**c**]{.red} d')).toBe('A b **c** d');
  });

  it('unwraps nested directives', () => {
    expect(stripStyleDirectives(':large[x :color[y]{.blue} z]')).toBe('x y z');
  });

  it('unwraps unknown labelled directives and drops empty ones', () => {
    expect(stripStyleDirectives(':huge[hot] and :u[] gone')).toBe('hot and  gone');
  });

  it('keeps label-less prose and line breaks byte-for-byte', () => {
    expect(stripStyleDirectives('Re:Plan\n:u[x]\nTime 10:30')).toBe('Re:Plan\nx\nTime 10:30');
  });

  it('leaves directives inside code untouched', () => {
    expect(stripStyleDirectives('`:u[x]`\n\n```\n:u[y]\n```')).toBe('`:u[x]`\n\n```\n:u[y]\n```');
  });
});
