import { safeReturnPath } from '../app/return-path';

/** The edit route's search: who opened the editor. */
export interface EditCardSearch {
  /** D135: opened from the review queue. */
  from?: 'review';
  /** D320: the page that opened the editor; back, Cancel and Save return there. */
  back?: string;
}

/** `?from=review` and a safe `?back=` (see `safeReturnPath`); anything else is dropped. */
export function parseEditSearch(search: Record<string, unknown>): EditCardSearch {
  const parsed: EditCardSearch = {};
  if (search['from'] === 'review') parsed.from = 'review';
  const back = safeReturnPath(search['back']);
  if (back) parsed.back = back;
  return parsed;
}
