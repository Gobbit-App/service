import type { AutoPublishOutcome, ShareState, ShareSummary } from '@gobbit/shared';
import { formatEventWhen } from '@gobbit/shared/event-time';

/** D196: the status line of a share. */
const STATE_LABEL: Readonly<Record<ShareState, string>> = {
  processing: 'Processing…',
  failed: "Couldn't add this",
  in_review: 'Waiting for review',
  published: 'Published',
  not_added: 'Not added',
};

export function stateLabel(state: ShareState): string {
  return STATE_LABEL[state];
}

/** D193: why a publisher's share waits for review, or that it skipped review. */
const AUTO_PUBLISH_COPY: Readonly<Record<AutoPublishOutcome, string>> = {
  published: 'Published directly',
  held_not_publisher: "you can't publish in this deck",
  held_needs_category: 'needs a category',
  held_duplicate: 'possible duplicate',
  held_duplicate_check_failed: "the duplicate check didn't finish",
  held_publish_failed: "it couldn't be published directly",
  held_event_unverified: 'check the date and time before publishing',
};

export function autoPublishCopy(outcome: AutoPublishOutcome): string {
  return AUTO_PUBLISH_COPY[outcome];
}

/** The held reason shown next to "Waiting for review", or null when there is none. */
export function heldReason(share: Pick<ShareSummary, 'state' | 'autoPublish'>): string | null {
  if (share.state !== 'in_review' || !share.autoPublish || share.autoPublish === 'published') {
    return null;
  }
  return autoPublishCopy(share.autoPublish);
}

/** What the sharer recognises the share by: title, then the link's host, then its photos. */
export function shareTitle(share: Pick<ShareSummary, 'preview' | 'item'>): string {
  const { title, host, photoCount } = share.preview;
  if (share.item?.title) return share.item.title;
  if (title) return title;
  if (host) return host;
  if (photoCount > 0) return photoCount === 1 ? '1 photo' : `${photoCount} photos`;
  return 'Shared text';
}

/** D198: lists poll while anything is still processing. */
export function anyProcessing(shares: readonly Pick<ShareSummary, 'state'>[] | undefined): boolean {
  return shares?.some((s) => s.state === 'processing') ?? false;
}

/**
 * D377: "Proposed as an event: Thu 3 Dec, 18:00" for a share that became an event card (times in
 * the viewer's zone, all-day dates as written); null for any other card.
 */
export function shareEventLine(
  share: Pick<ShareSummary, 'state' | 'item'>,
  viewerTimeZone: string,
  now: Date,
): string | null {
  const event = share.item?.event;
  if (!event || share.item?.deleted) return null;
  const verb =
    share.state === 'published' ? 'Published' : share.state === 'in_review' ? 'Proposed' : null;
  if (!verb) return null;
  const startsAt = new Date(event.startsAt);
  const when = formatEventWhen(
    { ...event, startsAt, endsAt: new Date(startsAt.getTime() + 1) },
    viewerTimeZone,
    { now, hasEnd: false },
  );
  return `${verb} as an event: ${when.time ? `${when.date}, ${when.time}` : when.date}`;
}
