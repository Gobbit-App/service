import { useState } from 'react';
import type { ReactElement } from 'react';
import type { LinkHealth } from '@gobbit/shared';
import { eventSpan } from '@gobbit/shared/event-constants';
import { eventPhase, formatEventStatus, formatEventWhen } from '@gobbit/shared/event-time';
import { LinkCard, initialSource } from './LinkCard';
import type { EventCardPayload } from './payload-guards';
import { deviceTimeZone } from '../lib/device-time-zone';
import { useMinuteClock } from '../lib/use-minute-clock';
import { Icon } from '../ui/icons/Icon';
import '../event-cards/event-cards.css';

/**
 * 042 (T037, T041, D367): the status line ("In 3 days · Thu 3 Dec, 18:00", "Happening now"), the
 * whole span with the event's own clock when it differs, the location and the optional link.
 * Times are shown in the viewer's zone; all-day dates read the same everywhere.
 */
export function EventCard({
  payload,
  cloudName = null,
  health = null,
  viewerTimeZone = deviceTimeZone(),
  showImage = true,
}: {
  payload: EventCardPayload;
  cloudName?: string | null;
  health?: LinkHealth | null;
  /** Tests pin the zone. */
  viewerTimeZone?: string;
  /** 044: false when the card's cover supersedes the link's preview image. */
  showImage?: boolean;
}): ReactElement {
  const now = useMinuteClock();
  // 044 (D396): a generic image stands in when no link image will show. A failure belongs to
  // one preview image, so a different preview starts over.
  const preview = payload.link?.preview;
  const imageKey = `${preview?.publicId ?? ''}|${preview?.image ?? ''}`;
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const linkImage =
    payload.link !== undefined &&
    initialSource(payload.link, cloudName) !== 'none' &&
    failedKey !== imageKey;
  const placeholder = showImage && !linkImage;
  const span = { ...eventSpan(payload), allDay: payload.allDay, timeZone: payload.timeZone };
  const options = { now, hasEnd: payload.end !== undefined };
  const ended = eventPhase(span, now, viewerTimeZone).phase === 'ended';
  const when = formatEventWhen(span, viewerTimeZone, options);

  return (
    <div className="event-card">
      {placeholder && (
        <div className="event-card__placeholder" aria-hidden="true">
          <Icon name="calendar" />
        </div>
      )}
      <p className={`event-status${ended ? ' event-status--muted' : ''}`}>
        {formatEventStatus(span, now, viewerTimeZone, options)}
      </p>
      <p className="event-when">{when.range}</p>
      {when.zoneNote && <p className="event-zone">{when.zoneNote}</p>}
      {payload.location && (
        <p className="event-location" dir="auto">
          <Icon name="map-pin" />
          <span>{payload.location}</span>
        </p>
      )}
      {payload.link && (
        <LinkCard
          payload={payload.link}
          cloudName={cloudName}
          health={health}
          showImage={showImage}
          onImageFailed={() => setFailedKey(imageKey)}
        />
      )}
    </div>
  );
}
