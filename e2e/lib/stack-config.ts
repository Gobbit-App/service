// Checked-in constants for the self-contained e2e stack (047). Nothing here is a real credential.

export const PROJECT_PREFIX = 'gobbit-e2e-';

/** Stacks older than this are reaped by the runner. */
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export const CLOUDINARY_DUMMY = {
  cloudName: 'e2e-cloud',
  apiKey: 'e2e-key',
  apiSecret: 'dummy, e2e only',
} as const;

export const EMAIL_DOMAIN = 'example.test';

/** Written to the stack's PLATFORM_ADMINS. */
export const ADMIN_EMAIL = `e2e-admin@${EMAIL_DOMAIN}`;

export const TIMEOUTS = {
  stackUpSeconds: 300,
  healthSeconds: 120,
  mailSeconds: 10,
} as const;
