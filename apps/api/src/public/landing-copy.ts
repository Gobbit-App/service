import { WAITLIST_NOTE_MAX, type WaitlistKind } from '@gobbit/shared';
import { ANALYTICS_PRIVACY_NOTE } from '@gobbit/shared/analytics';

/**
 * D230: every string of the landing page. A translation is a second object with the same shape;
 * templates read only from here.
 */
export const LANDING_COPY_EN = {
  lang: 'en',
  dir: 'ltr',
  locale: 'en_US',
  title: 'Gobbit — a deck of useful cards for your family and community',
  description:
    'Keep the phone numbers, how-tos, links and recipes your people keep asking about as short cards anyone can find in seconds, even offline.',
  header: { signIn: 'Sign in', openApp: 'Open Gobbit' },
  hero: {
    heading: 'Every useful gobbit, in one deck',
    lead: 'Gobbit keeps the things your family or community keeps asking about — phone numbers, how-tos, links, recipes — as short cards anyone can find in seconds, even offline.',
    invite: "We're letting people in a few at a time. Join the waitlist and we'll email you.",
  },
  uses: [
    {
      title: 'For a family',
      body: "The plumber's number, the wifi password, how the boiler resets — one place everyone can open.",
    },
    {
      title: 'For a community',
      body: 'A building, a street or a club: shared contacts, rules and tips, kept up to date by a few people.',
    },
    {
      title: 'Just for you',
      body: 'Save a link or a note from your phone and find it again when you need it.',
    },
  ],
  form: {
    heading: 'Join the waitlist',
    email: 'Email',
    kind: 'Who is it for?',
    note: 'Anything you want us to know? (optional)',
    submit: 'Join the waitlist',
    /** Label of the off-screen honeypot; people never see it. */
    honeypot: 'Leave this empty',
  },
  kinds: {
    family: 'My family',
    community: "A community I'm part of",
    personal: 'Just me',
    other: 'Something else',
  } satisfies Record<WaitlistKind, string>,
  states: {
    joined: {
      heading: 'Check your email to confirm',
      body: "We've sent you a link. Open it to confirm your place on the waitlist.",
    },
    confirmed: {
      heading: "You're on the list",
      body: "Thanks for confirming. We'll email you when there's room.",
    },
    confirmInvalid: {
      heading: 'That link no longer works',
      body: 'It may have expired or been used already. Join again below and we will send a new one.',
    },
    signedIn: { body: "You're signed in." },
  },
  errors: {
    email: 'Enter a valid email address.',
    kind: 'Choose who Gobbit is for.',
    noteTooLong: `Keep the note under ${WAITLIST_NOTE_MAX} characters.`,
    formHeading: 'Please check the form',
    tooManyTries: (minutes: number) =>
      `Too many tries. Please try again in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
  },
  // FR-013 (033): the analytics notice ships with app tracking.
  privacy: `We use your email only to let you in. No tracking cookies. ${ANALYTICS_PRIVACY_NOTE}`,
  footer: 'Gobbit',
} as const;

export type LandingCopy = typeof LANDING_COPY_EN;
