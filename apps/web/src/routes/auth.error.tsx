import { createFileRoute } from '@tanstack/react-router';
import { authErrorCopy, parseReason, type AuthErrorReason } from '../lib/auth-error-copy';
import { ButtonLink } from '../ui/buttons/ButtonLink';

/** Where the API's magic-link callback sends a failed sign-in (`?reason=`). */
export const Route = createFileRoute('/auth/error')({
  validateSearch: (search: Record<string, unknown>): { reason: AuthErrorReason } => ({
    reason: parseReason(search.reason),
  }),
  component: AuthError,
});

function AuthError() {
  const { reason } = Route.useSearch();
  const copy = authErrorCopy(reason);
  return (
    <main className="page page--narrow">
      <section className="error-state" role="alert">
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <ButtonLink href="/sign-in" icon="send" label="Get a new link" />
      </section>
    </main>
  );
}
