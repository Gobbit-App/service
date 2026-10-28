# Implementation notes: 029-registration-gate

Plan: `specs/029-registration-gate/plan.md`, tasks: `tasks.md`. Branch `feat/029-registration-gate`, on `feat/028-waitlist`. API, database and sign-in copy. E2E tier: none in this PR — the copy is covered by unit tests; the `/welcome` links and their smoke/full specs (T031, T032) ship with 030.

## Decisions not specified by the plan

- **`register(email, reason, ctx)` takes `{ requestId, actorId? }`** rather than a bare `actorId`: every `users.register` decision event needs the request id. `memberships.service.invite` gained the same `{ requestId }` context from the route.
- **`findExisting` is a separate name for the same lookup as `findByEmail`**, so call sites that must never create read as such.
- **Decision events have a third correlation, `bootId`.** `registration.mode` happens once per process, outside any request or job; `decisionLogger` now accepts exactly one of `requestId`, `jobId` or `bootId`.
- **Existing auth int suites run with `REGISTRATION_MODE=open`.** They test link mechanics with fresh addresses; the gate matrix lives in `apps/api/test/registration-gate.int.test.ts` (both modes, with and without `APP_URL`). T020/T021 are covered there too rather than in `members.int.test.ts`.
- **The sent message keeps the address**: "If <email> has a Gobbit account, a sign-in link is on its way. If it doesn't, we've sent a link to join the waitlist."

## Deviations from the plan

- **`registration.mode` is recorded in `server.ts`** after the listener starts (`services/registration-mode.ts`), not in `app.ts`, which every test builds.
- **`requestMagicLink` checks the limits with `rateLimits.check`, not `enforce`**, so `auth.magic_link` `refused` is recorded before the same 429 (as 028 did for the waitlist).
- **T031–T034's links move to 030** ("Settle before starting": 029 shipped first). This PR adds the `closed` copy and the shared sent message; the "Join the waitlist" actions on `/sign-in` and `/auth/error` come with `/welcome`.
- **T055–T056** (quickstart on a deployed instance, converge) wait for the deploy.
