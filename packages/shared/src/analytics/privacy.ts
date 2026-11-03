/**
 * 035 / D266: every analytics string in one place, shared by the API-rendered pages and the app.
 * Says what is measured, with which id, what never is, that it is on unless declined and where
 * to change it. Never presents Do Not Track as an off switch (FR-012).
 */

/** Landing privacy note (US4.1): anonymous counting, the banner and the "Analytics" button. */
export const ANALYTICS_PRIVACY_NOTE =
  'We count page visits without cookies or anything that identifies you, unless you choose “No thanks” in the banner; the “Analytics” button changes it. When you are signed in, we count which screens you open and when you add, edit, share or delete a card, tagged with your member id, unless you decline in the app. We never record what you write, deck or card names, search terms or your email.';

/** Visitor banner on the landing page, public pages and share previews (D264). */
export const ANALYTICS_BANNER = {
  label: 'Analytics choice',
  text: 'We count page visits to improve Gobbit: no cookies, nothing personal. It is on unless you say no.',
  allow: 'OK',
  decline: 'No thanks',
  reopen: 'Analytics',
  /** `{date}` is replaced in the browser with the stored date. */
  currentAllowed: 'You allowed counting on {date}.',
  currentDeclined: 'You said no on {date}.',
} as const;

/** Member prompt in the app (D263). */
export const ANALYTICS_PROMPT = {
  label: 'Usage analytics',
  title: 'Help improve Gobbit?',
  text: 'We count which screens you open and when you add, edit, share or delete a card, linked to your member id. We never record what you write, deck or card names, search terms or your email. It is on unless you say no; change it any time in Settings → Privacy.',
  allow: 'Allow',
  decline: 'No thanks',
  close: 'Close',
  failed: 'Couldn’t save your choice. Try again.',
} as const;

/** Settings → Privacy (D266). */
export const ANALYTICS_SETTINGS = {
  text: 'We count which screens you open and when you add, edit, share or delete a card, linked to your member id, so we can improve Gobbit. We never record what you write, deck or card names, search terms or your email. It is on unless you turn it off here.',
  switchLabel: 'Usage analytics',
  unanswered: 'Not answered yet (on)',
  /** `{date}` is the formatted date of the choice. */
  since: 'Since {date}',
  offline: 'Changing this needs a connection',
  failed: 'Couldn’t save your choice. Try again.',
  unconfigured: 'This server doesn’t measure usage.',
} as const;
