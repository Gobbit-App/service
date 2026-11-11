import type { ReactElement } from 'react';
import type { Item } from '@gobbit/shared';
import { cardAge } from '../../lib/card-age';
import { relativeTime } from '../../lib/relative-time';
import { sourceLink } from '../../lib/source-link';
import { sourceKindLabel } from '../source-kind';
import { SectionFrame } from './SectionFrame';

function TimeLine({ label, iso, now }: { label: string; iso: string; now: Date }) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return (
    <p className="browse-section__line">
      <time dateTime={at.toISOString()} title={at.toLocaleString()}>
        {`${label} ${relativeTime(at, now)}`}
      </time>
    </p>
  );
}

/** D246: how the card got here, where from, and when it was added/edited/published. */
export function CardSource({ item, now = new Date() }: { item: Item; now?: Date }): ReactElement {
  const link = sourceLink(item.sourceUrl);
  const edited = cardAge(item, now)?.label.startsWith('Edited') === true;
  return (
    <SectionFrame id={`browse-source-${item.id}`} title="Source">
      <p className="browse-section__line">{sourceKindLabel(item.sourceKind)}</p>
      {link && (
        <p className="browse-section__line">
          <a href={link.href} target="_blank" rel="noopener noreferrer">
            {link.host}
          </a>
        </p>
      )}
      <TimeLine label="Added" iso={item.createdAt} now={now} />
      {edited && <TimeLine label="Edited" iso={item.updatedAt} now={now} />}
      {item.verifiedAt && <TimeLine label="Published" iso={item.verifiedAt} now={now} />}
    </SectionFrame>
  );
}
