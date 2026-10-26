import { useId, useState, type FormEvent, type ReactElement } from 'react';
import type { Deck, MemberRole } from '@pb/shared';
import { ROLE_LABELS } from '@pb/shared/authz';
import { memberRoles } from '@pb/shared/enums';
import { AdminError } from './AdminError';
import { useInviteMember } from './deck-admin-queries';
import { Button } from '../ui/buttons/Button';

/** Readers first: the least access is the default choice. */
const ROLE_ORDER: readonly MemberRole[] = [...memberRoles].reverse();

/** D184: invite (or re-invite, which replaces the pending invite) with any role. */
export function InviteForm({
  deck,
  disabled,
}: {
  deck: Pick<Deck, 'id' | 'slug'>;
  disabled: boolean;
}): ReactElement {
  const baseId = useId();
  const invite = useInviteMember(deck);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('reader');
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setSentTo(null);
    invite.mutate(
      { email: trimmed, role },
      {
        onSuccess: () => {
          setSentTo(trimmed);
          setEmail('');
          setRole('reader');
        },
      },
    );
  };

  return (
    <form className="card-editor admin-form" onSubmit={handleSubmit} aria-label="Invite someone">
      <label htmlFor={`${baseId}-email`}>Email</label>
      <input
        id={`${baseId}-email`}
        type="email"
        value={email}
        autoComplete="off"
        disabled={disabled}
        aria-invalid={invite.isError || undefined}
        onChange={(event) => setEmail(event.currentTarget.value)}
      />
      <AdminError error={invite.error} />

      <label htmlFor={`${baseId}-role`}>Role</label>
      <select
        id={`${baseId}-role`}
        value={role}
        disabled={disabled}
        onChange={(event) => setRole(event.currentTarget.value as MemberRole)}
      >
        {ROLE_ORDER.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r].label} — {ROLE_LABELS[r].description}
          </option>
        ))}
      </select>

      <Button
        type="submit"
        icon="send"
        label={invite.isPending ? 'Sending…' : 'Send invite'}
        disabled={disabled || invite.isPending || email.trim() === ''}
      />
      {sentTo && (
        <p className="muted" role="status">
          Invite sent to {sentTo}.
        </p>
      )}
    </form>
  );
}
