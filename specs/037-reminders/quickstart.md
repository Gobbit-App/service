# Quickstart: validating reminders

## Setup

```bash
pnpm install && pnpm db:migrate && pnpm dev
# optional push: generate keys once
pnpm --filter @gobbit/api exec web-push generate-vapid-keys
# put them in .env as VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, VAPID_SUBJECT=mailto:you@example.com
```

## Automated

```bash
pnpm test:unit                       # schema, schedule, dismissers, push request, UI components
pnpm test:int -- reminders notify    # read paths, dismiss, sweep at-most-once, push cleanup
pnpm test:e2e -- --grep @full reminders
```

## Manual

1. In a shared deck, create a reminder due in 3 minutes, "show before 1 minute", "Anyone who can
   edit". As a reader it's absent; as an owner it's under ⋯ → Upcoming.
2. After 2 minutes it appears in the deck for everyone with "Due in 1 minute".
3. At the deadline (≤ 1 minute later) writers get one email (console mailer locally) and one push
   per enabled device; the bell lights red.
4. Dismiss with Done on and a resolution: the card moves to Archived with the outcome; the light
   goes off. Restore it: overdue again, no new email.
5. Settings → Notifications: turn emails off, enable push, send a test.
