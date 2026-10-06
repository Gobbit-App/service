/** Possible auth error reasons. */
export type AuthErrorReason = 'invalid' | 'used' | 'expired' | 'unknown';

/** Validates and parses an auth error reason. */
export function parseReason(reason: unknown): AuthErrorReason {
  if (reason === 'invalid' || reason === 'used' || reason === 'expired') {
    return reason;
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
    case 'unknown':
      return {
        title: 'Sign-in failed',
        body: 'Something went wrong. Request a new link below.',
      };
  }
}
