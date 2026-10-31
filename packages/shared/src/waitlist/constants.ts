/** Phase 9 waitlist constants (D217–D220). The API, worker and landing page read these. */
import type { WaitlistKind, WaitlistStatus } from '../enums';

/** Maximum note length in Unicode code points. */
export const WAITLIST_NOTE_MAX = 500;

/** Maximum `utm_source` length; values must match `WAITLIST_UTM_PATTERN`. */
export const WAITLIST_UTM_MAX = 64;
export const WAITLIST_UTM_PATTERN = /^[a-z0-9_-]{1,64}$/;

/** How long a confirmation link works. */
export const WAITLIST_CONFIRM_TTL_DAYS = 7;

/** Pending entries are deleted this long after their link expired; removed ones after removal. */
export const WAITLIST_PENDING_RETENTION_DAYS = 30;

/** D220: weekly prune, Sundays 06:00. */
export const WAITLIST_PRUNE_CRON = '0 6 * * 0';

/** 032: how long the "You're in" sign-in link works (env `WAITLIST_INVITE_TTL_DAYS`). */
export const WAITLIST_INVITE_TTL_DAYS_DEFAULT = 7;

/** 032: page size of `GET /admin/waitlist`. */
export const ADMIN_WAITLIST_PAGE_DEFAULT = 50;
export const ADMIN_WAITLIST_PAGE_MAX = 100;

/** 032: how the admin screen names each kind. */
export const WAITLIST_KIND_LABELS: Readonly<Record<WaitlistKind, string>> = {
  family: 'Family',
  community: 'Community',
  personal: 'Just me',
  other: 'Other',
};

/** 032: how the admin screen names each status tab. */
export const WAITLIST_STATUS_LABELS: Readonly<Record<WaitlistStatus, string>> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  invited: 'Invited',
  removed: 'Removed',
};
