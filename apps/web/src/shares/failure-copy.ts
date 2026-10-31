import type { IngestFailureCode, ShareSummary } from '@gobbit/shared';

export const UNKNOWN_FAILURE = 'Something went wrong.';

/** D194: why a share failed, in words the sharer can act on; raw codes never reach the screen. */
const FAILURE_COPY: Readonly<Record<IngestFailureCode, string>> = {
  content_expired: 'The shared copy is no longer kept.',
  sharer_left: "You're no longer a member of this deck.",
  fetch_failed: "The page couldn't be fetched.",
  unreadable_answer: "The assistant's answer was unusable.",
  assistant_unavailable: "The assistant wasn't available.",
  image_unavailable: "The photo couldn't be read.",
  unknown: UNKNOWN_FAILURE,
};

/** Plain-language reason; an unknown or missing code falls back to "Something went wrong". */
export function failureCopy(code: string | null | undefined): string {
  if (!code || !Object.hasOwn(FAILURE_COPY, code)) return UNKNOWN_FAILURE;
  return FAILURE_COPY[code as IngestFailureCode];
}

/** FR-005: what to do once the stored copy is gone; email is forwarded, not pasted. */
export function pasteAgainCopy(channel: ShareSummary['channel']): string {
  return channel === 'email' ? 'Forward the email again to share it.' : 'Paste it again';
}
