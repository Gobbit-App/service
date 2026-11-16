import type { ReactElement } from 'react';
import type { LinkHealth } from '@gobbit/shared';
import { eventSpan, nextOccurrence } from '@gobbit/shared/event-constants';
import { eventPhase, formatEventStatus, formatEventWhen } from '@gobbit/shared/event-time';
import { LinkCard } from './LinkCard';
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
  showImage = true,
  viewerTimeZone = deviceTimeZone(),
}: {
  payload: EventCardPayload;
  cloudName?: string | null;
  health?: LinkHealth | null;
  /** D411: false when the card has a cover (it supersedes the link image). */
  showImage?: boolean;
  /** Tests pin the zone. */
  viewerTimeZone?: string;
}): ReactElement {
  const now = useMinuteClock();
  // D402: a yearly event shows its next occurrence even when the stored one has ended.
  const current = nextOccurrence(payload, now);
  const span = { ...eventSpan(current), allDay: current.allDay, timeZone: current.timeZone };
  const options = { now, hasEnd: current.end !== undefined };
  const ended = eventPhase(span, now, viewerTimeZone).phase === 'ended';
  const when = formatEventWhen(span, viewerTimeZone, options);

  return (
    <div className="event-card">
      <p className={`event-status${ended ? ' event-status--muted' : ''}`}>
        {formatEventStatus(span, now, viewerTimeZone, options)}
      </p>
      {current.repeat === 'yearly' && <p className="event-repeat">Every year</p>}
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
        />
      )}
    </div>
  );
}
