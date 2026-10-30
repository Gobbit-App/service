# Implementation notes: 030-landing-page

Plan: `specs/030-landing-page/plan.md`, tasks: `tasks.md`. Branch `feat/030-landing-page`, on `feat/029-registration-gate`. API landing page, Caddy/Vite/service-worker routing, the SPA's signed-out home, the preview image, and the `/welcome` links moved here from 029 (its T031–T034). E2E tier: smoke — the root's preview tags and the member/stranger split at `/` are deploy-critical; the form flows are `@full` (they write waitlist rows).

## Decisions not specified by the plan

- **`via` comes from a header Caddy sets** (`X-Gobbit-Via: root` on the `@landing` rewrite, stripped from client requests on `@welcome`), and from `?from=app` for the SPA's redirect; anything else is `direct`.
- **Copy, styles, form parsing and request helpers are separate modules** in `apps/api/src/public/` (`landing-copy.ts`, `landing-styles.ts`, `landing-form.ts`, `landing-request.ts`) so `landing.ts` only renders.
- **The honeypot value is cut to a fixed length** before it reaches the service; its content is never logged.
- **The 029 links**: `/sign-in` gets "New here? Join the waitlist" as a plain link; `/auth/error?reason=closed` shows "Join the waitlist" (primary) and "Get a new link" (ghost). Both reach `/welcome` with a full page load.
- **The smoke spec skips the `/` checks on the Vite dev server** (`:5173`), which does not emulate Caddy's cookie rule; CI's smoke runs against Compose + Caddy, where they apply.

## Deviations from the plan

- **Per-IP limit inside `POST /welcome`**, using 028's waitlist bucket and its `rate_limit.refused` event, instead of `public-rate-limit` middleware: middleware answers with a bare problem response, while D228 wants the 429 to re-render the typed values.
- **A 429 renders the `invalid` state** with a page notice ("Too many tries…") and no field errors.
- **`layout()` gained `css` and `headerLink` options and `imageSize`**; `sitemapXml` takes the root URL as its first entry.
- **The signed-out home goes to `/welcome?from=app`** (keeping `utm_*`), not bare `/welcome`, so `landing.render` can tell `app` from `direct`.
- **Caddy uses a named `@welcome` matcher**: `handle /welcome /welcome/joined` is not valid Caddyfile (one path per inline matcher).
- **`ButtonLink` gained a `document` prop** (plain `<a>`, full page load) for links that leave the SPA; `NavLink` always navigates client-side.
- **T055–T057** (PLAN.md demo 3, quickstart on a deployed instance, converge) wait for the deploy.
