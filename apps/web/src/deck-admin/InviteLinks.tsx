import { useEffect, useState, type ReactElement } from 'react';
import type { Deck, InviteLink } from '@gobbit/shared';
import { ROLE_LABELS } from '@gobbit/shared/authz';
import { trackContent } from '../analytics/analytics';
import { shareItem, type ShareNavigator } from '../lib/share';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/buttons/Button';
import { IconButton } from '../ui/buttons/IconButton';
import { ErrorState, LoadingState } from '../ui/StatusViews';
import { AdminError } from './AdminError';
import { useInviteLinks, useRevokeInviteLink } from './deck-admin-queries';

const STATE_LABEL = {
  waiting: 'Waiting',
  accepted: 'Accepted',
  revoked: 'Revoked',
  expired: 'Expired',
} as const;

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

/** D476: the owner's link invites, laid out like the pending rows of the member list. */
export function InviteLinks({
  deck,
  disabled,
  nav,
}: {
  deck: Deck;
  disabled: boolean;
  nav?: ShareNavigator;
}): ReactElement | null {
  const links = useInviteLinks(deck.slug);
  if (links.isPending) return <LoadingState label="Loading invite links…" />;
  if (!links.data)
    return (
      <ErrorState message="Couldn't load the invite links." onRetry={() => void links.refetch()} />
    );
  if (links.data.length === 0) return null;
  return (
    <ul className="admin-list" aria-label="Invite links">
      {links.data.map((link) => (
        <InviteLinkRow key={link.id} deck={deck} link={link} disabled={disabled} nav={nav} />
      ))}
    </ul>
  );
}

function InviteLinkRow({
  deck,
  link,
  disabled,
  nav,
}: {
  deck: Deck;
  link: InviteLink;
  disabled: boolean;
  nav?: ShareNavigator;
}): ReactElement {
  const revoke = useRevokeInviteLink(deck);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  const invalid = link.state === 'invalid';
  const detail = invalid
    ? 'no longer valid'
    : [
        ROLE_LABELS[link.role].label,
        STATE_LABEL[link.state as keyof typeof STATE_LABEL],
        link.state === 'accepted' ? null : `until ${day(link.expiresAt)}`,
      ]
        .filter(Boolean)
        .join(' · ');
  const by = link.acceptedBy;

  const share = async () => {
    if (!link.url) return;
    const outcome = await shareItem(
      { url: link.url, title: deck.name, text: `Join ${deck.name} on Gobbit:` },
      nav ?? (navigator as ShareNavigator),
    ).catch(() => 'failed' as const);
    if (outcome === 'shared' || outcome === 'copied')
      trackContent('invite-shared', {
        deckId: deck.id,
        channel: outcome === 'shared' ? 'share-sheet' : 'copy-link',
      });
    if (outcome === 'copied') setToast('Link copied');
    else if (outcome === 'failed') setToast("Couldn't share this link");
  };

  return (
    <li className="admin-list__item admin-member">
      <div className="admin-member__id">
        {by && (
          <Avatar
            size="md"
            ariaLabel={by.name ?? 'Member'}
            member={{
              id: by.id,
              initials: by.initials,
              photo: by.photo,
              username: by.username,
              name: by.name,
            }}
          />
        )}
        <div className="admin-member__who">
          <strong dir="auto">{link.name}</strong>
          <span className="muted">
            {detail}
            {by && ` · accepted by ${by.username || by.name || 'Member'}`}
          </span>
          {link.createdBy && (
            <span className="muted">
              created by {link.createdBy.username || link.createdBy.name || 'Member'}
            </span>
          )}
        </div>
      </div>
      <div className="admin-member__actions">
        {link.state === 'waiting' && link.url && (
          <span className="share-button-wrap">
            <IconButton icon="share" label="Share" onClick={() => void share()} />
            {toast && (
              <span role="status" className="share-button__toast">
                {toast}
              </span>
            )}
          </span>
        )}
        {(link.state === 'waiting' || invalid) &&
          (confirming ? (
            <>
              <Button
                icon="user-minus"
                label="Revoke the link"
                variant="danger"
                disabled={disabled || revoke.isPending}
                onClick={() => revoke.mutate(link.id, { onSettled: () => setConfirming(false) })}
              />
              <Button
                icon="close"
                label="Keep"
                variant="ghost"
                onClick={() => setConfirming(false)}
              />
            </>
          ) : (
            <Button
              icon="user-minus"
              label="Revoke"
              variant="danger"
              aria-label={`Revoke ${link.name}`}
              disabled={disabled || revoke.isPending}
              onClick={() => setConfirming(true)}
            />
          ))}
      </div>
      <AdminError error={revoke.error} />
    </li>
  );
}
