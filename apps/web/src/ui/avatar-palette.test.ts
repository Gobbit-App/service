import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(`${import.meta.dirname}/../styles.css`, 'utf8');

const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const token = (name: string): [string, string] => {
  const m = new RegExp(`${name}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`, 'i').exec(
    css,
  );
  if (!m) throw new Error(`missing token ${name}`);
  return [m[1]!, m[2]!];
};

describe('avatar palette (D420)', () => {
  for (const [theme, at] of [
    ['light', 0],
    ['dark', 1],
  ] as const) {
    it(`every pair reaches 4.5:1 in ${theme}`, () => {
      for (let n = 1; n <= 10; n++) {
        const ratio = contrast(token(`--avatar-${n}-bg`)[at], token(`--avatar-${n}-fg`)[at]);
        expect(ratio, `avatar ${n}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
