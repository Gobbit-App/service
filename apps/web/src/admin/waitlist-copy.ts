import type { AdminWaitlistEntry } from '@gobbit/shared';
import { isApiError } from '../api/api-error';
import { GENERIC_SAVE_ERROR, problemMessages } from '../api/problem-messages';
import { relativeTime } from '../lib/relative-time';

/** 032 problem types in the screen's own words (the list refreshes behind them). */
const WAITLIST_PROBLEM_COPY: Readonly<Record<string, string>> = {
  '/problems/waitlist-not-confirmed': "This person hasn't confirmed their email yet.",
  '/problems/waitlist-removed': 'This entry was removed.',
  '/problems/waitlist-invited': 'Invited people keep their place; they can’t be removed.',
};

const FALLBACK = "Couldn't update the waitlist. Check your connection and try again.";

/** Lines to show under a failed invite or removal. */
export function waitlistErrorMessages(err: unknown): string[] {
  const type = isApiError(err) ? err.problem?.type : undefined;
  const copy = type ? WAITLIST_PROBLEM_COPY[type] : undefined;
  if (copy) return [copy];
  return problemMessages(err).map((m) => (m === GENERIC_SAVE_ERROR ? FALLBACK : m));
}

/** Which actions a row offers: invite (confirmed), resend (invited), remove (not yet invited). */
export function waitlistActions(status: AdminWaitlistEntry['status']): {
  invite: 'invite' | 'resend' | null;
  remove: boolean;
} {
  switch (status) {
    case 'confirmed':
      return { invite: 'invite', remove: true };
    case 'pending':
      return { invite: null, remove: true };
    case 'invited':
      return { invite: 'resend', remove: false };
    case 'removed':
      return { invite: null, remove: false };
  }
}

/** The row's "when" line: the step that put the entry in its current tab. */
export function waitlistWhen(entry: AdminWaitlistEntry, now: Date): string {
  const ago = (iso: string) => relativeTime(new Date(iso), now);
  switch (entry.status) {
    case 'confirmed':
      return `Confirmed ${ago(entry.confirmedAt ?? entry.createdAt)}`;
    case 'invited': {
      const by = entry.invitedBy ? ` by ${entry.invitedBy.displayName}` : '';
      return `Invited ${ago(entry.invitedAt ?? entry.createdAt)}${by}`;
    }
    case 'removed':
      return `Removed ${ago(entry.removedAt ?? entry.createdAt)}`;
    case 'pending':
      return `Joined ${ago(entry.createdAt)}`;
  }
}
