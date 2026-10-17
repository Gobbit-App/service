import type { ReviewEntry } from '@pb/shared';
import { relativeTime } from '../lib/relative-time';

type ReviewJob = NonNullable<ReviewEntry['job']>;

const CHANNEL_LABELS: Record<ReviewJob['channel'], string> = {
  pwa: 'Share',
  shortcut: 'Shortcut',
  email: 'email',
  paste: 'paste',
  mcp: 'AI app',
};

/** An AI app's own name leads its channel label: "Claude (AI app)". */
function channelLabel(job: ReviewJob): string {
  const label = CHANNEL_LABELS[job.channel];
  return job.clientLabel ? `${job.clientLabel} (${label})` : label;
}

/** D107: "shared by Dana via Shortcut · 2 minutes ago"; parts the job lacks are left out. */
export function sourceLine(job: ReviewJob | null, now: Date): string | null {
  if (!job) return null;
  const who = job.sharedBy ? `shared by ${job.sharedBy.displayName}` : 'shared';
  const when = new Date(job.createdAt);
  const ago = Number.isNaN(when.getTime()) ? null : relativeTime(when, now);
  return [`${who} via ${channelLabel(job)}`, ago].filter(Boolean).join(' · ');
}
