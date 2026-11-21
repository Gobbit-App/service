import type { ImportRow } from './constants';
import { toImportDraft, type ImportCategory } from './to-draft';

export interface DryRunProblem {
  line: number;
  message: string;
}

export interface DryRunReport {
  /** Cards that would be imported (rows without a problem). */
  cards: number;
  /** Per category, a card with two categories counts under both; a new category counts under its name. */
  categories: { name: string; count: number }[];
  problems: DryRunProblem[];
}

/** D448: what an import would do, from the same `toImportDraft` the real import uses (SC-003). */
export function report(
  rows: readonly ImportRow[],
  categories: readonly ImportCategory[],
  opts: { strict?: boolean } = {},
): DryRunReport {
  const counts = new Map<string, number>();
  const problems: DryRunProblem[] = [];
  let cards = 0;
  for (const row of rows) {
    if (row.error) {
      // Parser errors read "Line N: why" where N is the offending field line.
      const m = /^Line (\d+): (.*)$/s.exec(row.error);
      problems.push(
        m ? { line: Number(m[1]), message: m[2] } : { line: row.line, message: row.error },
      );
      continue;
    }
    const draft = toImportDraft(row, categories, opts);
    for (const name of draft.unmatched ?? []) {
      problems.push({
        line: row.line,
        message: `category "${name}" matches no category of the deck`,
      });
    }
    const names = [
      ...(draft.categoryIds ?? []).map((id) => categories.find((c) => c.id === id)!.name),
      ...(draft.newCategory ? [draft.newCategory] : []),
    ];
    if (!names.length && !draft.unmatched) {
      problems.push({ line: row.line, message: 'no category' });
      continue;
    }
    if (draft.unmatched) continue;
    cards++;
    for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return { cards, categories: [...counts].map(([name, count]) => ({ name, count })), problems };
}
