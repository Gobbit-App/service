/** Format a relative time difference using Intl.RelativeTimeFormat. */
export function relativeTime(from: Date, now: Date, locale = 'en'): string {
  const diffMs = from.getTime() - now.getTime();
  const diffSeconds = diffMs / 1000;
  const absDiff = Math.abs(diffSeconds);

  let unit: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
  let value: number;

  if (absDiff < 60) {
    unit = 'second';
    value = Math.round(diffSeconds);
  } else if (absDiff < 3600) {
    unit = 'minute';
    value = Math.round(diffSeconds / 60);
  } else if (absDiff < 86400) {
    unit = 'hour';
    value = Math.round(diffSeconds / 3600);
  } else if (absDiff < 604800) {
    unit = 'day';
    value = Math.round(diffSeconds / 86400);
  } else if (absDiff < 2592000) {
    unit = 'week';
    value = Math.round(diffSeconds / 604800);
  } else if (absDiff < 31536000) {
    unit = 'month';
    value = Math.round(diffSeconds / 2592000);
  } else {
    unit = 'year';
    value = Math.round(diffSeconds / 31536000);
  }

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  return rtf.format(value, unit);
}

/** Format when something was last checked/verified. */
export function checkedAgo(verifiedAt: string | null, now: Date, locale = 'en'): string | null {
  if (verifiedAt === null) {
    return null;
  }

  try {
    const date = new Date(verifiedAt);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return `checked ${relativeTime(date, now, locale)}`;
  } catch {
    return null;
  }
}
