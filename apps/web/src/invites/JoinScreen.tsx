import { useState, type ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InvitePreview } from '@gobbit/shared';
import { ROLE_LABELS } from '@gobbit/shared/authz';
import { isApiError } from '../api/api-error';
import { api, unwrap } from '../api/client';
import { meQuery } from '../api/queries';
import { queryKeys } from '../api/query-keys';
import { Button } from '../ui/buttons/Button';
import { ButtonLink } from '../ui/buttons/ButtonLink';
import { useNavigateHref } from '../ui/NavLink';
import { SignInForm } from '../ui/SignInForm';

const GONE_COPY = {
  used: 'This invite has already been used.',
  revoked: 'This invite was revoked.',
  expired: 'This invite has expired.',
  invalid: 'This invite is no longer valid.',
} as const;

/** D470/D471: what an invite link offers; signed out, Join reveals the sign-in form. */
export function JoinScreen({ token }: { token: string }): ReactElement {
  const navigate = useNavigateHref();
  const qc = useQueryClient();
  const preview = useQuery({
    queryKey: queryKeys.invitePreview(token),
    queryFn: ({ signal }): Promise<InvitePreview> =>
      unwrap(api.GET('/invites/preview', { params: { query: { t: token } }, signal })),
    retry: false,
  });
  const me = useQuery({ ...meQuery(), retry: false });
  const [askEmail, setAskEmail] = useState(false);
  const [memberOf, setMemberOf] = useState<string | null>(null);
  const accept = useMutation({
    mutationFn: () => unwrap(api.POST('/invite-links/accept', { body: { token } })),
    onSuccess: async ({ deck }) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.me }),
        qc.invalidateQueries({ queryKey: queryKeys.decks }),
      ]);
      navigate(`/d/${deck.slug}`);
    },
    onError: (error) => {
      const deck = isApiError(error) ? error.problem?.deck : null;
      if (isApiError(error) && error.status === 409 && deck && typeof deck === 'object') {
        setMemberOf((deck as { slug: string }).slug);
      } else if (isApiError(error) && error.status === 409) {
        void preview.refetch();
      }
    },
  });

  const requestLink = async (email: string, invite?: string) => {
    await unwrap(api.POST('/auth/magic-link', { body: { email, ...(invite ? { invite } : {}) } }));
  };

  let body: ReactElement;
  if (preview.isPending) {
    body = <p role="status">Loading…</p>;
  } else if (!preview.data) {
    body = <h1>We couldn't open this invite</h1>;
  } else if (memberOf) {
    body = (
      <>
        <h1>You're already in</h1>
        <ButtonLink href={`/d/${memberOf}`} icon="forward" label="Open the deck" />
      </>
    );
  } else if (preview.data.state !== 'waiting') {
    body = (
      <>
        <h1>Invite unavailable</h1>
        <p>{GONE_COPY[preview.data.state]}</p>
      </>
    );
  } else {
    const { deckName, inviterName, role } = preview.data;
    const signedIn = me.isSuccess;
    body = (
      <>
        <h1>{deckName}</h1>
        <p>
          {inviterName} invited you as {role ? ROLE_LABELS[role].label : 'a member'}.
        </p>
        {signedIn && <p className="lead">Signed in as {me.data.user.displayName}</p>}
        {accept.isError && !memberOf && (
          <p className="form-error" role="alert">
            Couldn't join. Try again.
          </p>
        )}
        {me.isPending ? null : signedIn ? (
          <Button
            icon="check"
            label="Join"
            disabled={accept.isPending}
            onClick={() => accept.mutate()}
          />
        ) : askEmail ? (
          <SignInForm onSubmit={requestLink} invite={token} />
        ) : (
          <Button icon="check" label="Join" onClick={() => setAskEmail(true)} />
        )}
      </>
    );
  }

  return (
    <main className="page page--narrow">
      <section className="error-state">{body}</section>
    </main>
  );
}
