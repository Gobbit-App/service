/** D189: note formats the parser understands. */
export const importFormats = ['lines', 'markdown', 'csv'] as const;
export type ImportFormat = (typeof importFormats)[number];

/** Imported notes become text cards, or link cards for a bare URL / a `url` column. */
export const importCardTypes = ['text', 'link'] as const;
export type ImportCardType = (typeof importCardTypes)[number];

/** One parsed note; the zod twin is `importRowSchema` (kept zod-free for the lazy web chunk). */
export interface ImportRow {
  /** 1-based source line (CSV: spreadsheet row number, the header being row 1). */
  line: number;
  type: ImportCardType;
  title: string;
  body: string;
  sourceUrl: string | null;
  /** Category name from a Markdown heading or the CSV `category` column. */
  category: string | null;
  /** Why the row can't be imported; invalid rows are never sent. */
  error: string | null;
}

export interface ImportParseResult {
  rows: ImportRow[];
  /** A problem with the whole text (e.g. a CSV without a usable header); rows is then empty. */
  problem: string | null;
}
