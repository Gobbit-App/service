import type { ReactElement } from 'react';
import type { ImportRunResult } from '@gobbit/shared/import';
import type { PreviewRow } from './preview-rows';
import { Button } from '../ui/buttons/Button';
import { ButtonLink } from '../ui/buttons/ButtonLink';

/** The API's detail may end in an ISO time ("…try again after <ISO>"); show it in local time. */
function localised(text: string): string {
  return text.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, (iso) => new Date(iso).toLocaleString());
}

const PROBLEM_COPY: Readonly<Record<string, (detail?: string) => string>> = {
  '/problems/rate-limited': (detail) =>
    localised(
      detail?.includes('after') ? detail : 'Daily import limit reached; try again tomorrow',
    ),
};

/** D190: counts, the rows that failed (by source line) and the way to their review. */
export function ImportResult({
  result,
  sent,
  unmatched = [],
  reviewHref,
  onAgain,
}: {
  result: ImportRunResult;
  /** The rows sent, in order: a failure's `index` points into it. */
  sent: readonly PreviewRow[];
  /** Category names the deck lacks (D446): suggested as new, or the reason rows were refused. */
  unmatched?: readonly string[];
  reviewHref: string;
  onAgain: () => void;
}): ReactElement {
  return (
    <section className="import-result" aria-label="Import result">
      <p role="status">
        Imported {result.imported}
        {result.duplicates > 0 && `, ${result.duplicates} flagged as possible duplicates`}
        {result.failed.length > 0 && `, ${result.failed.length} failed`}
        {!!result.refused && ` (${result.refused} refused by rule)`}.
      </p>
      {result.failed.length > 0 && (
        <ul className="import-result__failed">
          {result.failed.map((failure) => {
            const row = sent[failure.index];
            return (
              <li key={failure.index}>
                {row ? `Line ${row.line}` : `Row ${failure.index + 1}`}
                {row && (
                  <>
                    {' '}
                    (<span dir="auto">{row.title}</span>)
                  </>
                )}
                :{' '}
                {PROBLEM_COPY[failure.problem]?.(failure.detail) ??
                  failure.detail ??
                  failure.problem}
              </li>
            );
          })}
        </ul>
      )}
      {unmatched.length > 0 && (
        <p>
          Categories not in this deck:{' '}
          {unmatched.map((name, i) => (
            <span key={name} dir="auto">
              {i > 0 && ', '}
              {name}
            </span>
          ))}
          .
        </p>
      )}
      <div className="import-preview__actions">
        {result.imported > 0 && <ButtonLink href={reviewHref} icon="inbox" label="Review them" />}
        <Button icon="file-import" label="Import more" variant="ghost" onClick={onAgain} />
      </div>
    </section>
  );
}
