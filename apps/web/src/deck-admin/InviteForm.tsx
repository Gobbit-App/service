import { useEffect, useId, useState, type FormEvent, type ReactElement } from 'react';
import type { Deck, MemberRole } from '@gobbit/shared';
import { ROLE_LABELS } from '@gobbit/shared/authz';
import { memberRoles } from '@gobbit/shared/enums';
import { AdminError } from './AdminError';
import { api, unwrap } from '../api/client';
import { useInviteMember } from './deck-admin-queries';
import { Button } from '../ui/buttons/Button';
import { Avatar, avatarLabel, type AvatarMember } from '../ui/Avatar';

/** Readers first: the least access is the default choice. */
const ROLE_ORDER: readonly MemberRole[] = [...memberRoles].reverse();

const LOOKUP_DELAY_MS = 400;
/** A complete-looking email (a lookup for less is wasted); any non-empty username. */
const lookupable = (q: string) =>
  q.includes('@') ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q) : q !== '';

/** D424: debounced preview of who an email/username is; every failure (429 too) is a quiet miss. */
function useMemberPreview(query: string): { member: AvatarMember | null; settled: boolean } {
  const [result, setResult] = useState<{ query: string; member: AvatarMember | null } | null>(null);
  useEffect(() => {
    if (!lookupable(query)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      unwrap(api.POST('/members/lookup', { body: { query } }))
        .then((r) => {
          const member = (r as { member?: AvatarMember | null }).member ?? null;
          if (!cancelled) setResult({ query, member });
        })
        .catch(() => undefined); // 429 or offline: show nothing, the invite is unaffected
    }, LOOKUP_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);
  const current = result?.query === query && lookupable(query);
  return { member: current ? result.member : null, settled: current };
}

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
  const query = email.trim();
  const isEmail = query.includes('@');
  const preview = useMemberPreview(query);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setSentTo(null);
    invite.mutate(isEmail ? { email: trimmed, role } : { username: trimmed, role }, {
      onSuccess: () => {
        setSentTo(trimmed);
        setEmail('');
        setRole('reader');
      },
    });
  };

  return (
    <form className="card-editor admin-form" onSubmit={handleSubmit} aria-label="Invite someone">
      <label htmlFor={`${baseId}-email`}>Email or username</label>
      <input
        id={`${baseId}-email`}
        type="text"
        value={email}
        autoComplete="off"
        disabled={disabled}
        aria-invalid={invite.isError || undefined}
        onChange={(event) => setEmail(event.currentTarget.value)}
      />
      {preview.member ? (
        <p className="muted">
          <Avatar member={preview.member} size="md" label={avatarLabel(preview.member)} />{' '}
          {preview.member.name ?? `@${preview.member.username}`}
        </p>
      ) : (
        preview.settled &&
        !isEmail && (
          <p className="muted" role="status">
            No member found
          </p>
        )
      )}
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
