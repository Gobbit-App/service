import { describe, expect, it } from 'vitest';
import type { SearchEvalCase } from '@pb/db/test';
import { formatEvalReport, isEvalHit, scoreEval } from './search-eval-score';

const hit = (expect: string[]): SearchEvalCase => ({
  q: 'q',
  expect,
  lang: 'en',
  kind: 'substring',
});

describe('search eval scoring', () => {
  it('needs every expected key in the top k', () => {
    expect(isEvalHit({ evalCase: hit(['a', 'b']), topKeys: ['b', 'x', 'a'] })).toBe(true);
    expect(isEvalHit({ evalCase: hit(['a']), topKeys: ['x', 'x', 'x', 'x', 'x', 'a'] })).toBe(
      false,
    );
  });

  it('treats a "no result" pair as a hit only when nothing returns', () => {
    expect(isEvalHit({ evalCase: hit([]), topKeys: [] })).toBe(true);
    expect(isEvalHit({ evalCase: hit([]), topKeys: ['a'] })).toBe(false);
  });

  it('scores recall and lists the misses', () => {
    const report = scoreEval([
      { evalCase: hit(['a']), topKeys: ['a'] },
      { evalCase: hit(['b']), topKeys: ['c'] },
    ]);
    expect(report.recall).toBe(0.5);
    expect(report.misses).toHaveLength(1);
    expect(formatEvalReport('text', report)).toContain('want b; got c');
  });

  it('scores an empty run as perfect', () => {
    expect(scoreEval([]).recall).toBe(1);
  });
});
