import type { AutoPublishOutcome, ShareState, ShareSummary } from '@pb/shared';

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
