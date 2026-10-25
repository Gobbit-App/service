import { useQuery } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';
import type { Deck, Member, MemberRole } from '@pb/shared';
import { can, ROLE_LABELS } from '@pb/shared/authz';
import { memberRoles } from '@pb/shared/enums';
import { SettingsSection } from '../settings/SettingsSection';
import { ErrorState, LoadingState } from '../ui/StatusViews';
import { AdminError } from './AdminError';
import { membersQuery, useChangeRole, useRemoveMember } from './deck-admin-queries';
import { InviteForm } from './InviteForm';
import { Button } from '../ui/buttons/Button';

/**
 * D184/D185: everyone sees the member list; owners (`member.invite`, `member.remove`) also
 * invite, change roles and remove. Implicit owners and the caller have no controls.
 */
export function MembersSection({
  deck,
  meId,
  online,
}: {
  deck: Deck;
  meId: string | undefined;
  online: boolean;
}): ReactElement {
  const members = useQuery(membersQuery(deck.slug));
  const manage = can(deck.role, 'member.invite') && can(deck.role, 'member.remove');

  return (
    <SettingsSection title="Members">
      {members.isPending ? (
        <LoadingState label="Loading members…" />
      ) : !members.data ? (
        <ErrorState message="Couldn't load the members." onRetry={() => void members.refetch()} />
      ) : (
        <ul className="admin-list" aria-label="Members">
          {members.data.map((member) => (
            <MemberRow
              key={member.userId}
              deck={deck}
              member={member}
              isMe={member.userId === meId}
              manage={manage && online}
            />
          ))}
        </ul>
      )}
      {manage && <InviteForm deck={deck} disabled={!online} />}
    </SettingsSection>
  );
}

function roleText(member: Member): string {
  if (member.implicit) return 'Account owner';
  const label = ROLE_LABELS[member.role].label;
  return member.acceptedAt ? label : `Invited · ${label}`;
}

function MemberRow({
  deck,
  member,
  isMe,
  manage,
}: {
  deck: Deck;
  member: Member;
  isMe: boolean;
  manage: boolean;
}): ReactElement {
  const changeRole = useChangeRole(deck);
  const remove = useRemoveMember(deck);
  const [confirming, setConfirming] = useState(false);
  const pending = member.acceptedAt === null;
  const controls = manage && !member.implicit && !isMe;
  const busy = changeRole.isPending || remove.isPending;
  const removeLabel = pending ? 'Cancel invite' : 'Remove';

  return (
    <li className="admin-list__item admin-member">
      <div className="admin-member__who">
        <strong dir="auto">
          {member.displayName}
          {isMe && ' (you)'}
        </strong>
        <span className="muted">{member.email}</span>
      </div>
      {controls && !pending ? (
        <select
          aria-label={`Role of ${member.displayName}`}
          value={member.role}
          disabled={busy}
          onChange={(event) =>
            changeRole.mutate({
              userId: member.userId,
              role: event.currentTarget.value as MemberRole,
            })
          }
        >
          {memberRoles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r].label}
            </option>
          ))}
        </select>
      ) : (
        <span className="admin-member__role">{roleText(member)}</span>
      )}
      {controls &&
        (confirming ? (
          <div className="admin-member__actions">
            <Button
              icon="user-minus"
              label={pending ? 'Cancel the invite' : `Remove ${member.displayName}`}
              variant="danger"
              disabled={busy}
              onClick={() =>
                remove.mutate(member.userId, { onSettled: () => setConfirming(false) })
              }
            />
            <Button
              icon="close"
              label="Keep"
              variant="ghost"
              onClick={() => setConfirming(false)}
            />
          </div>
        ) : (
          <Button
            icon="user-minus"
            label={removeLabel}
            variant="danger"
            aria-label={`${removeLabel} ${member.displayName}`}
            disabled={busy}
            onClick={() => setConfirming(true)}
          />
        ))}
      <AdminError error={changeRole.error ?? remove.error} />
    </li>
  );
}
