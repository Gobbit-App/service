import type { ShareSummary } from '@pb/shared';
import type { ReactElement } from 'react';
import { isApiError } from '../api/api-error';
import { relativeTime } from '../lib/relative-time';
import { deckHref } from '../ui/chip-order';
import { NavLink } from '../ui/NavLink';
import { failureCopy, pasteAgainCopy } from './failure-copy';
import { heldReason, shareTitle, stateLabel } from './share-state';
import { useRetryShare } from './shares-queries';

/** The retry error as a line; 410 is handled by switching to "Paste it again" instead. */
function retryErrorMessage(err: unknown): string {
  if (!isApiError(err)) return "Couldn't try again. Check your connection.";
  return err.problem?.detail ?? "Couldn't try again.";
}

/** FR-004/FR-005: Try again while the stored copy is kept, otherwise Paste it again. */
function FailedActions({
  share,
  deckSlug,
  online,
}: {
  share: ShareSummary;
  deckSlug: string;
  online: boolean;
}): ReactElement | null {
  const retry = useRetryShare(deckSlug);
  const expired =
    share.failureCode === 'content_expired' ||
    (isApiError(retry.error) && retry.error.status === 410);

  if (expired) {
    if (share.channel === 'email') {
      return <p className="share-row__hint">{pasteAgainCopy('email')}</p>;
    }
    // FR-016: offline, the action is shown but disabled.
    return online ? (
      <NavLink
        href={`/share?deck=${encodeURIComponent(deckSlug)}`}
        className="button button--ghost"
      >
        {pasteAgainCopy(share.channel)}
      </NavLink>
    ) : (
      <button type="button" className="button button--ghost" disabled>
        {pasteAgainCopy(share.channel)}
      </button>
    );
  }
  if (!share.canRetry) return null;
  return (
    <>
      <button
        type="button"
        className="button"
        disabled={!online || retry.isPending}
        onClick={() => retry.mutate(share.id)}
      >
        {retry.isPending ? 'Trying again…' : 'Try again'}
      </button>
      {retry.isError && (
        <p className="share-row__hint" role="alert">
          {retryErrorMessage(retry.error)}
        </p>
      )}
    </>
  );
}

/**
 * The card the share became: a link while it exists; once deleted, a link to Recently deleted
 * for those who can restore it (D132), otherwise "Card deleted".
 */
function CardLink({
  item,
  label,
  deckSlug,
  canRestore,
}: {
  item: NonNullable<ShareSummary['item']>;
  label: string;
  deckSlug: string;
  canRestore: boolean;
}) {
  if (!item.deleted) return <NavLink href={`/i/${item.id}`}>{label}</NavLink>;
  if (canRestore) {
    return (
      <NavLink href={deckHref(deckSlug, 'archived')}>Card deleted — open Recently deleted</NavLink>
    );
  }
  return <span className="share-row__hint">Card deleted</span>;
}

/** D196: what happened to the share, plus the one thing the sharer can do about it. */
export function ShareDetail({
  share,
  deckSlug,
  online,
  now,
  canRestore = false,
}: {
  share: ShareSummary;
  deckSlug: string;
  online: boolean;
  now: Date;
  /** The viewer may undelete cards (`item.delete`). */
  canRestore?: boolean;
}): ReactElement | null {
  const card = (label: string) =>
    share.item ? (
      <CardLink item={share.item} label={label} deckSlug={deckSlug} canRestore={canRestore} />
    ) : null;
  switch (share.state) {
    case 'processing':
      return null;
    case 'failed':
      return (
        <>
          <p className="share-row__reason">{failureCopy(share.failureCode)}</p>
          <div className="share-row__actions">
            <FailedActions share={share} deckSlug={deckSlug} online={online} />
          </div>
        </>
      );
    case 'in_review':
      return card('Open proposal');
    case 'published':
      return card('Open card');
    case 'not_added':
      return (
        <p className="share-row__hint">
          {share.reviewedBy && <span dir="auto">By {share.reviewedBy.displayName}</span>}
          {share.reviewedBy && share.reviewedAt && ' · '}
          {share.reviewedAt && (
            <time dateTime={share.reviewedAt}>{relativeTime(new Date(share.reviewedAt), now)}</time>
          )}
        </p>
      );
  }
}

/** D198: one row of Your shares. */
export function ShareRow({
  share,
  deckSlug,
  online,
  now,
  canRestore = false,
}: {
  share: ShareSummary;
  deckSlug: string;
  online: boolean;
  now: Date;
  canRestore?: boolean;
}): ReactElement {
  const held = heldReason(share);
  return (
    <li className={`share-row share-row--${share.state}`}>
      <div className="share-row__line">
        <span className="share-row__title" dir="auto">
          {shareTitle(share)}
        </span>
        <time className="share-row__time" dateTime={share.createdAt}>
          {relativeTime(new Date(share.createdAt), now)}
        </time>
      </div>
      <p className="share-row__state" aria-live="polite">
        {stateLabel(share.state)}
        {held && ` — ${held}`}
      </p>
      <ShareDetail
        share={share}
        deckSlug={deckSlug}
        online={online}
        now={now}
        canRestore={canRestore}
      />
    </li>
  );
}
