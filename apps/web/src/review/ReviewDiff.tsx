import type { ReactElement } from 'react';
import type { FieldChange } from './review-diff';

/** D106: what "Apply update" changes on the existing card, field by field. */
export function ReviewDiff({ changes }: { changes: readonly FieldChange[] }): ReactElement {
  if (changes.length === 0) {
    return <p className="review-diff__same">Same as the existing card.</p>;
  }
  return (
    <dl className="review-diff">
      {changes.map((change) => (
        <div key={change.field} className="review-diff__row">
          <dt>{change.label}</dt>
          <dd>
            <del dir="auto">{change.before || '—'}</del>
            <ins dir="auto">{change.after || '—'}</ins>
          </dd>
        </div>
      ))}
    </dl>
  );
}
