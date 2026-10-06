import { createFileRoute } from '@tanstack/react-router';
import { api, unwrap } from '../api/client';
import { safeNext } from '../api/session-redirect';
import { SignInForm } from '../ui/SignInForm';

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search: Record<string, unknown>): { next?: string } => {
    const next = safeNext(search.next);
    return next ? { next } : {};
  },
  component: SignIn,
});

function SignIn() {
  const { next } = Route.useSearch();

  /** D66: `next` rides in the magic link, so the email lands the user where they were. */
  const requestLink = async (email: string) => {
    await unwrap(api.POST('/auth/magic-link', { body: { email, ...(next ? { next } : {}) } }));
  };

  return (
    <main className="page page--narrow">
      <h1 className="brand">Gobbit</h1>
      <p className="lead">Your family's pocket of useful cards.</p>
      <SignInForm onSubmit={requestLink} />
    </main>
  );
}
