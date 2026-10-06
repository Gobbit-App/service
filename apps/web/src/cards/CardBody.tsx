import { lazy, Suspense, type ReactElement } from 'react';
import type { Item } from '@pb/shared';
import { ImageCard } from './ImageCard';
import { LinkCard } from './LinkCard';
import { TableCard } from './TableCard';
import { TextCard } from './TextCard';
import { asCalcPayload, asImagePayload, asLinkPayload, asTablePayload } from './payload-guards';

/** D57: the calculator (and the expression evaluator) loads only when a calc card renders. */
const CalcCard = lazy(async () => ({ default: (await import('./CalcCard')).CalcCard }));

export const INVALID_CARD_COPY = "This card can't be shown.";

function Invalid(): ReactElement {
  return <p className="card-muted">{INVALID_CARD_COPY}</p>;
}

/** The type-specific part of a card; a malformed payload degrades to a note instead of throwing. */
function TypedBody({
  item,
  cloudName,
}: {
  item: Item;
  cloudName: string | null;
}): ReactElement | null {
  switch (item.type) {
    case 'text':
      return null;
    case 'link': {
      const payload = asLinkPayload(item.payload);
      return payload ? <LinkCard payload={payload} /> : <Invalid />;
    }
    case 'image': {
      const payload = asImagePayload(item.payload);
      return payload ? <ImageCard payload={payload} cloudName={cloudName} /> : <Invalid />;
    }
    case 'table': {
      const payload = asTablePayload(item.payload);
      return payload ? <TableCard payload={payload} /> : <Invalid />;
    }
    case 'calc': {
      const payload = asCalcPayload(item.payload);
      return payload ? (
        <Suspense fallback={<p className="card-muted">Loading calculator…</p>}>
          <CalcCard payload={payload} />
        </Suspense>
      ) : (
        <Invalid />
      );
    }
    default:
      return <Invalid />;
  }
}

export function CardBody({
  item,
  cloudName,
}: {
  item: Item;
  cloudName: string | null;
}): ReactElement {
  const body = item.body?.trim() ?? '';
  return (
    <div className="card__body">
      <TypedBody item={item} cloudName={cloudName} />
      {body !== '' && <TextCard body={body} />}
    </div>
  );
}
