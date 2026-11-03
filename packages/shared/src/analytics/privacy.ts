/**
 * 035 / D266: every analytics string in one place, shared by the API-rendered pages and the app.
 * Says what is measured, with which id, what never is and where
 * to change it; off until allowed (D281). Never presents Do Not Track as an off switch (FR-012).
 */

/** Landing privacy note (US4.1): opt-in counting and the "Analytics" button (D281). */
export const ANALYTICS_PRIVACY_NOTE =
  'With your permission we count page visits, without cookies. Signed in, we count the screens you open and the cards you add, edit, share or delete, linked to your account. Never your content, searches or email. The “Analytics” button changes your choice.';

/** Visitor choice on the landing page, public pages and share previews (D264, a wall since D281). */
export const ANALYTICS_BANNER = {
  label: 'Analytics choice',
  title: 'Help improve Gobbit?',
  text: 'We’d like to count your page visits. No cookies, no ads, never sold.',
  allow: 'Allow',
  decline: 'No thanks',
  reopen: 'Analytics',
  /** `{date}` is replaced in the browser with the stored date. */
  currentAllowed: 'You allowed this on {date}.',
  currentDeclined: 'You said no on {date}.',
} as const;

/** Member choice in the app (D263, a wall since D281). */
export const ANALYTICS_PROMPT = {
  label: 'Usage analytics',
  title: 'Help improve Gobbit?',
  text: 'We’d like to count the screens you open and the cards you add, edit, share or delete, linked to your account. Never your content, searches or email. Change it any time in Settings → Privacy.',
  allow: 'Allow',
  decline: 'No thanks',
  failed: 'Couldn’t save your choice. Try again.',
} as const;

/** Settings → Privacy (D266). */
export const ANALYTICS_SETTINGS = {
  text: 'We count the screens you open and the cards you add, edit, share or delete, linked to your account. Never your content, searches or email. Off unless you allow it.',
  switchLabel: 'Usage analytics',
  unanswered: 'Not answered yet (off)',
  /** `{date}` is the formatted date of the choice. */
  since: 'Since {date}',
  offline: 'Changing this needs a connection',
  failed: 'Couldn’t save your choice. Try again.',
  unconfigured: 'This server doesn’t measure usage.',
} as const;
