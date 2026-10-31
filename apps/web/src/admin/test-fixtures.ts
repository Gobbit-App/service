import type { AdminWaitlistCounts, AdminWaitlistEntry } from '@gobbit/shared';

/** A confirmed entry (the default admin view); override fields per test. */
export function makeWaitlistEntry(overrides: Partial<AdminWaitlistEntry> = {}): AdminWaitlistEntry {
  return {
    id: '00000000-0000-4000-8000-0000000000a1',
    email: 'person@example.test',
    kind: 'community',
    note: null,
    source: 'landing',
    status: 'confirmed',
    createdAt: '2026-03-01T12:00:00.000Z',
    confirmedAt: '2026-03-02T12:00:00.000Z',
    invitedAt: null,
    removedAt: null,
    invitedBy: null,
    ...overrides,
  };
}

export function makeCounts(overrides: Partial<AdminWaitlistCounts> = {}): AdminWaitlistCounts {
  return { pending: 0, confirmed: 0, invited: 0, removed: 0, ...overrides };
}
