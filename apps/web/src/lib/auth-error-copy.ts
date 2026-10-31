/** Possible auth error reasons. */
export type AuthErrorReason = 'invalid' | 'used' | 'expired' | 'onboarding' | 'closed' | 'unknown';

const KNOWN_REASONS: readonly AuthErrorReason[] = [
  'invalid',
  'used',
  'expired',
  'onboarding',
  'closed',
];

/** Validates and parses an auth error reason. */
export function parseReason(reason: unknown): AuthErrorReason {
  if (KNOWN_REASONS.includes(reason as AuthErrorReason)) {
    return reason as AuthErrorReason;
  }
  return 'unknown';
}

/** Returns UI copy for an auth error reason. */
export function authErrorCopy(reason: AuthErrorReason): { title: string; body: string } {
  switch (reason) {
    case 'invalid':
      return {
        title: "That link doesn't work",
        body: 'The sign-in link is not valid. Request a new one below.',
      };
    case 'used':
      return {
        title: 'That link was already used',
        body: 'Each sign-in link works once. Request a new one below.',
      };
    case 'expired':
      return {
        title: 'That link has expired',
        body: 'Sign-in links last 15 minutes. Request a new one below.',
      };
    case 'onboarding':
      return {
        title: "We couldn't set up your deck",
        body: 'Sign-in stopped before it finished. Try the same link again, or request a new one below.',
      };
    case 'closed':
      return {
        title: 'Gobbit is invite-only for now',
        body: "This email doesn't have an account yet. Join the waitlist and we'll let you know when there's room.",
      };
    case 'unknown':
      return {
        title: 'Sign-in failed',
        body: 'Something went wrong. Request a new link below.',
      };
  }
}
