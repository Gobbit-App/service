# Data Model: Landing page

No schema change and no migration. The form writes only through 028's `waitlist.join` into `waitlist_entries` (see [028 data-model](../028-waitlist/data-model.md)). This file describes the page's view model, the form model and the constants.

## Page states (`public/landing.ts`)

Chosen from the request, in this order:

| State | When | Shows | Form | Robots | Cache-Control |
|-------|------|-------|------|--------|---------------|
| `signed-in` | `GET /welcome` with a valid session | hero, three uses, "Open Gobbit" → `/` | no | `index` | `private, no-store` |
| `invalid` | `POST /welcome` failed validation | hero, form with field messages and values | yes | `noindex` | `private, no-store` |
| `joined` | `GET /welcome/joined` | `role="status"`: "Check your email to confirm" | no | `noindex` | `public, max-age=300` |
| `confirmed` | `GET ?confirmed=1` | `role="status"`: "You're on the list" | no | `index`¹ | `public, max-age=300` |
| `confirm-invalid` | `GET ?confirm=invalid` | `role="status"`: "That link no longer works" + form | yes | `index`¹ | `public, max-age=300` |
| `default` | anything else | hero, three uses, form, privacy line | yes | `index` | `public, max-age=300` |

¹ Canonical is the root for every state, so search engines fold the states into one page.

Header link: "Sign in" (`/sign-in`) in every state except `signed-in`, which shows "Open Gobbit" (`/`).

```ts
type LandingState = 'default' | 'joined' | 'confirmed' | 'confirm-invalid' | 'invalid' | 'signed-in';

interface LandingView {
  state: LandingState;
  origin: string;                       // APP_URL origin, for canonical / og:url / og:image
  form?: LandingFormValues;             // values to re-fill (invalid) or hidden utm (default)
  errors?: Partial<Record<LandingField, string>>;  // message per field (invalid only)
}
```

## Form model (`public/landing-form.ts`)

Urlencoded body of `POST /welcome`:

| Field | HTML | Maps to `WaitlistJoinRequest` | Rule (from 028) |
|-------|------|-------------------------------|-----------------|
| `email` | `input type=email autocomplete=email inputmode=email required` | `email` | valid email, normalized by 028 |
| `kind` | four `input type=radio required` in a `fieldset` | `kind` | `family \| community \| personal \| other` |
| `note` | `textarea maxlength=WAITLIST_NOTE_MAX` | `note` (omitted when blank) | ≤ `WAITLIST_NOTE_MAX` (500) characters |
| `utm_source` | `input type=hidden` | `utmSource` (omitted when blank) | ≤ `WAITLIST_UTM_MAX` (64), 028's pattern; invalid → dropped silently, not an error |
| `website` | honeypot `input type=text tabindex=-1 autocomplete=off` in an off-screen block | `website` | non-empty → 028 drops the submission |

Server-side additions: `source = 'landing'`, `ip` from the same client-IP helper the anonymous limiter uses.

```ts
type LandingField = 'email' | 'kind' | 'note';

interface LandingFormValues {
  email: string;            // as typed (re-shown escaped)
  kind?: WaitlistKind;
  note: string;
  utmSource?: string;
}

// parseLandingForm(body) → { ok: true, input: WaitlistJoinInput } | { ok: false, values, errors }
```

Zod issues map to one message per field from `landing-copy.ts` (`errors.email`, `errors.kind`, `errors.noteTooLong`). Unknown fields are ignored (the HTML form only posts the five above).

## Copy (`public/landing-copy.ts`)

One exported object `LANDING_COPY_EN` with `lang: 'en'`, `dir: 'ltr'`, `title`, `description` (≤ 160 characters), hero, three use blurbs, form labels, kind labels, button, state messages, field errors, privacy line, header links. Templates read only from this object.

## Constants

| Name | Value | Where |
|------|-------|-------|
| `LANDING_PATH` | `/welcome` | `public/public-url.ts` |
| `LANDING_OG_IMAGE_PATH` | `/og/landing.png` | `share/og-template.ts` (shared with `og-static.ts`) |
| `LANDING_JOINED_PATH` | `/welcome/joined` | `public/public-url.ts` (031 counts this page view) |
| Cache | `PAGE_CACHE_CONTROL`, `PRIVATE_CACHE_CONTROL` | existing, `public/responses.ts` |
| Limits | `WAITLIST_JOIN_PER_IP_PER_HOUR`, `WAITLIST_JOIN_PER_EMAIL_PER_HOUR`, `WAITLIST_NOTE_MAX`, `WAITLIST_UTM_MAX` | 028, `@gobbit/shared` |

## In-process state

None new. GET responses are not stored in 017's page cache (no database read; rendering is a string template). The per-IP join bucket is 028's in-process limiter.
