import type { ReactElement } from 'react';
import { publishedMessage, type BulkPublishSummary } from './bulk-publish-summary';
import { Button } from '../ui/buttons/Button';

/** D191: the outcome of a bulk publish; skipped cards stay in the queue and are named here. */
export function BulkPublishNotice({
  summary,
  onDismiss,
}: {
  summary: BulkPublishSummary;
  onDismiss: () => void;
}): ReactElement {
  return (
    <div className="bulk-publish-notice" role="status">
      <p>{publishedMessage(summary.published)}</p>
      {summary.skipped.length > 0 && (
        <>
          <p>Skipped {summary.skipped.length}, still in the queue:</p>
          <ul>
            {summary.skipped.map((card) => (
              <li key={card.id}>
                <span dir="auto">{card.title}</span> — {card.reason}
              </li>
            ))}
          </ul>
        </>
      )}
      <Button icon="close" label="Dismiss" variant="ghost" onClick={onDismiss} />
    </div>
  );
}
