import type { SearchEvalCase } from '@pb/db/test';

export const EVAL_K = 5;
export const EVAL_MIN_RECALL = 0.9;

export interface EvalOutcome {
  evalCase: SearchEvalCase;
  /** Fixture keys of the fused results, best first. */
  topKeys: string[];
}

/** A pair passes when every expected card is in the top k; a "no result" pair when nothing comes back. */
export function isEvalHit({ evalCase, topKeys }: EvalOutcome, k = EVAL_K): boolean {
  if (evalCase.expect.length === 0) return topKeys.length === 0;
  const top = topKeys.slice(0, k);
  return evalCase.expect.every((key) => top.includes(key));
}

export interface EvalReport {
  recall: number;
  total: number;
  misses: EvalOutcome[];
}

export function scoreEval(outcomes: readonly EvalOutcome[], k = EVAL_K): EvalReport {
  const misses = outcomes.filter((o) => !isEvalHit(o, k));
  const total = outcomes.length;
  return { recall: total === 0 ? 1 : (total - misses.length) / total, total, misses };
}

/** Human-readable report: recall line plus each miss with its top k. */
export function formatEvalReport(label: string, report: EvalReport, k = EVAL_K): string {
  const lines = [
    `${label}: recall@${k} ${report.recall.toFixed(3)} (${report.total - report.misses.length}/${report.total})`,
  ];
  for (const { evalCase, topKeys } of report.misses) {
    const got = topKeys.slice(0, k).join(', ') || '∅';
    lines.push(
      `  miss [${evalCase.kind}] "${evalCase.q}" → want ${evalCase.expect.join(', ') || '∅'}; got ${got}`,
    );
  }
  return lines.join('\n');
}
