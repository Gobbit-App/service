import type { ReactElement } from 'react';
import type { Item } from '@gobbit/shared';
import { cardAge } from '../../lib/card-age';
import { relativeTime } from '../../lib/relative-time';
import { sourceKindLabel } from '../source-kind';
import { PaneFrame } from './PaneFrame';

/** An http(s) source as `{ href, host }`, or null for anything else (never a `javascript:` link). */
export function sourceLink(url: string | null): { href: string; host: string } | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return { href: parsed.href, host: parsed.host };
  } catch {
    return null;
  }
}

function TimeLine({ label, iso, now }: { label: string; iso: string; now: Date }) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return (
    <p className="browse-pane__line">
      <time dateTime={at.toISOString()} title={at.toLocaleString()}>
        {`${label} ${relativeTime(at, now)}`}
      </time>
    </p>
  );
}

/** Data-model §5: how the card got here, where from, and when it was added/edited/published. */
export function SourcePane({ item, now = new Date() }: { item: Item; now?: Date }): ReactElement {
  const link = sourceLink(item.sourceUrl);
  const edited = cardAge(item, now)?.label.startsWith('Edited') === true;
  return (
    <PaneFrame item={item}>
      <h3 className="browse-pane__heading">Source</h3>
      <p className="browse-pane__line">{sourceKindLabel(item.sourceKind)}</p>
      {link && (
        <p className="browse-pane__line">
          <a href={link.href} target="_blank" rel="noopener noreferrer">
            {link.host}
          </a>
        </p>
      )}
      <TimeLine label="Added" iso={item.createdAt} now={now} />
      {edited && <TimeLine label="Edited" iso={item.updatedAt} now={now} />}
      {item.verifiedAt && <TimeLine label="Published" iso={item.verifiedAt} now={now} />}
    </PaneFrame>
  );
}
