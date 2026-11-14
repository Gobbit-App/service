import { lazy, Suspense, type ReactElement } from 'react';
import type { Item } from '@gobbit/shared';
import { EventCard } from './EventCard';
import type { ImageLoading } from './ImageCard';
import { GalleryCard } from './media/GalleryCard';
import { MediaFacade } from './media/MediaFacade';
import { LinkCard } from './LinkCard';
import { TableCard } from './TableCard';
import { TextCard } from './TextCard';
import {
  asCalcPayload,
  asEventPayload,
  asMediaPayload,
  isMediaType,
  asLinkPayload,
  asTablePayload,
} from './payload-guards';
import { ReminderStatus } from '../reminders/ReminderStatus';

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
  image,
}: {
  item: Item;
  cloudName: string | null;
  image?: ImageLoading;
}): ReactElement | null {
  // D387: items cached by a pre-045 build say `image`.
  const type = isMediaType(item.type) ? 'media' : item.type;
  switch (type) {
    case 'text':
      return null;
    case 'link': {
      const payload = asLinkPayload(item.payload);
      return payload ? (
        <LinkCard payload={payload} cloudName={cloudName} health={item.linkHealth} />
      ) : (
        <Invalid />
      );
    }
    case 'media': {
      const media = asMediaPayload(item.payload);
      if (!media) return <Invalid />;
      // D398: photos (one renders exactly as before 045); D400: a PDF, video or audio facade.
      // Every card layout shows the title as the heading above the body (D206).
      return media.kind === 'image' ? (
        <GalleryCard title={item.title} payload={media} cloudName={cloudName} {...image} />
      ) : (
        <MediaFacade
          itemId={item.id}
          title={item.title}
          payload={media}
          cloudName={cloudName}
          {...image}
        />
      );
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
    case 'reminder':
      return <ReminderStatus item={item} />;
    case 'event': {
      const payload = asEventPayload(item.payload);
      return payload ? (
        <EventCard payload={payload} cloudName={cloudName} health={item.linkHealth} />
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
  image,
}: {
  item: Item;
  cloudName: string | null;
  /** Image loading hints for image cards (D144). */
  image?: ImageLoading;
}): ReactElement {
  const body = item.body?.trim() ?? '';
  return (
    <div className="card__body">
      <TypedBody item={item} cloudName={cloudName} image={image} />
      {body !== '' && <TextCard body={body} />}
    </div>
  );
}
