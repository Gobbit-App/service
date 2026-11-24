import { useId, useState, type FormEvent, type ReactElement } from 'react';
import type { Deck, MemberRole } from '@gobbit/shared';
import { ROLE_LABELS } from '@gobbit/shared/authz';
import { memberRoles } from '@gobbit/shared/enums';
import { AdminError } from './AdminError';
import { useCreateInviteLink } from './deck-admin-queries';
import { Button } from '../ui/buttons/Button';

/** Readers first, no owner: a link never grants ownership (D466). */
const ROLE_ORDER: readonly MemberRole[] = [...memberRoles].reverse().filter((r) => r !== 'owner');

/** D476: create a link invite (a reference name and a role); the link itself is shown in the list. */
export function InviteLinkForm({
  deck,
  disabled,
}: {
  deck: Pick<Deck, 'id' | 'slug'>;
  disabled: boolean;
}): ReactElement {
  const baseId = useId();
  const create = useCreateInviteLink(deck);
  const [name, setName] = useState('');
  const [role, setRole] = useState<MemberRole>('reader');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed, role: role as 'maintainer' | 'editor' | 'reader' },
      {
        onSuccess: () => {
          setName('');
          setRole('reader');
        },
      },
    );
  };

  return (
    <form className="card-editor admin-form" onSubmit={handleSubmit} aria-label="Invite by link">
      <label htmlFor={`${baseId}-name`}>Name</label>
      <input
        id={`${baseId}-name`}
        type="text"
        value={name}
        maxLength={60}
        autoComplete="off"
        disabled={disabled}
        aria-invalid={create.isError || undefined}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <AdminError error={create.error} />

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
        icon="link"
        label={create.isPending ? 'Creating…' : 'Create link'}
        disabled={disabled || create.isPending || name.trim() === ''}
      />
    </form>
  );
}
