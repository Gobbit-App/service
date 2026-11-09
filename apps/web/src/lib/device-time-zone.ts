/** The device's IANA time zone (falls back to UTC where the runtime can't tell). */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
