import { RRF_K, SUBSTRING_BOOST, type SearchWhy } from '@pb/shared';

/** One candidate from the hybrid query: ranks are 1-based within each arm, null when absent from that arm. */
export interface ArmRow {
  id: string;
  createdAt: Date;
  textRank: number | null;
  substring: boolean;
  vectorRank: number | null;
}

export interface FusedRow {
  id: string;
  why: SearchWhy;
  score: number;
}

/**
 * D75 RRF: score = Σ 1/(RRF_K + rank) over present arms, + SUBSTRING_BOOST when `substring`;
 * why = both | text | semantic; rows in neither arm are dropped; sort by score desc, then createdAt desc, then id desc; first `limit`.
 */
export function fuseRrf(rows: readonly ArmRow[], limit: number): FusedRow[] {
  const fused: { row: ArmRow; why: SearchWhy; score: number }[] = [];

  for (const row of rows) {
    const inText = row.textRank !== null || row.substring;
    const inVector = row.vectorRank !== null;
    if (!inText && !inVector) continue;

    let score = 0;
    if (row.textRank !== null) score += 1 / (RRF_K + row.textRank);
    if (row.vectorRank !== null) score += 1 / (RRF_K + row.vectorRank);
    if (row.substring) score += SUBSTRING_BOOST;

    const why: SearchWhy = inText && inVector ? 'both' : inText ? 'text' : 'semantic';
    fused.push({ row, why, score });
  }

  fused.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const timeDiff = b.row.createdAt.getTime() - a.row.createdAt.getTime();
    if (timeDiff !== 0) return timeDiff;
    if (a.row.id === b.row.id) return 0;
    return a.row.id < b.row.id ? 1 : -1;
  });

  return fused
    .slice(0, Math.max(0, limit))
    .map(({ row, why, score }) => ({ id: row.id, why, score }));
}
