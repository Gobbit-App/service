import { useState, type ReactElement } from 'react';
import type { AdminWaitlistEntry } from '@pb/shared';
import { WAITLIST_KIND_LABELS } from '@pb/shared/waitlist-constants';
import { Button } from '../ui/buttons/Button';
import { useInviteEntry, useRemoveEntry } from './waitlist-queries';
import { waitlistActions, waitlistErrorMessages, waitlistWhen } from './waitlist-copy';

/**
 * 032: one waitlist entry — email, kind, note and when — with Invite / Resend and Remove
 * (after a confirm). A failed email after a successful invite is reported to the screen.
 */
export function WaitlistRow({
  entry,
  now,
  online,
  onMailFailed,
}: {
  entry: AdminWaitlistEntry;
  now: Date;
  online: boolean;
  /** The row leaves its tab once invited, so the screen keeps the "resend" notice. */
  onMailFailed: (entry: AdminWaitlistEntry) => void;
}): ReactElement {
  const invite = useInviteEntry();
  const remove = useRemoveEntry();
  const [confirming, setConfirming] = useState(false);
  const actions = waitlistActions(entry.status);
  const busy = invite.isPending || remove.isPending;
  const offline = online ? null : 'Needs a connection';
  const error = invite.error ?? remove.error;
  const inviteVerb = actions.invite === 'invite' ? 'Invite' : 'Resend the link to';

  return (
    <li className="admin-list__item waitlist-row">
      <div className="waitlist-row__who">
        <strong className="waitlist-row__email">{entry.email}</strong>
        <span className="muted">
          {WAITLIST_KIND_LABELS[entry.kind]} · {waitlistWhen(entry, now)}
        </span>
        {entry.note && (
          <p className="waitlist-row__note" dir="auto">
            {entry.note}
          </p>
        )}
      </div>
      <div className="waitlist-row__actions">
        {actions.invite && (
          <Button
            icon="send"
            label={actions.invite === 'invite' ? 'Invite' : 'Resend'}
            aria-label={`${inviteVerb} ${entry.email}`}
            variant={actions.invite === 'invite' ? 'primary' : 'ghost'}
            disabled={busy}
            disabledReason={offline}
            onClick={() =>
              invite.mutate(entry.id, {
                onSuccess: (result) => {
                  if (!result.mailSent) onMailFailed(result.entry);
                },
              })
            }
          />
        )}
        {actions.remove &&
          (confirming ? (
            <>
              <Button
                icon="user-minus"
                label={`Remove ${entry.email}`}
                variant="danger"
                disabled={busy}
                disabledReason={offline}
                onClick={() => remove.mutate(entry.id, { onSettled: () => setConfirming(false) })}
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
              label="Remove"
              aria-label={`Remove ${entry.email}`}
              variant="danger"
              disabled={busy}
              disabledReason={offline}
              onClick={() => setConfirming(true)}
            />
          ))}
      </div>
      {error && (
        <div className="form-error" role="alert">
          {waitlistErrorMessages(error).map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
    </li>
  );
}
