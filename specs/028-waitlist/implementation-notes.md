# Implementation notes: 028-waitlist

Plan: `specs/028-waitlist/plan.md`, tasks: `tasks.md`. Branch `feat/028-waitlist`, on `main`. API and database only; no web change. E2E tier: none (030 owns the browser journey).

## Decisions not specified by the plan

- **The log hash is `createLogHash(key)(kind, value)`.** The key is injected once when services are built (`services.logHash`), so tests and the rate-limit middleware share one function and no module reads `env` at import time.
- **`decisionLogger(component, { parent, levels })`** takes an optional parent logger. Integration tests pass the capture logger through `createApp({ logger })`; production uses the root logger.
- **`rateLimitRefusal({ bucket, logHash, ipHeader })`** (`middleware/rate-limit-refused.ts`) builds the `rate_limit.refused` side of any `publicRateLimit` bucket; the caller still chooses the answer (problem or HTML page). 029–032 reuse it.
- **The prune job records `waitlist.prune` under component `worker`**, with the pg-boss job id (`'unknown'` if pg-boss gives none).

## Deviations from the plan

- **A confirmed entry keeps its token hash.** The plan's `UPDATE` cleared it; keeping it lets the second lookup tell a reused link (`used`) from a never-issued one (`unknown`). The hash is single-use either way (`status = 'pending'` in the `UPDATE`).
- **The per-email limit uses `rateLimits.check`, not `enforce`**, so the service records `refused` · `per_email` before throwing the same 429.
- **The per-IP limiter is registered on `/waitlist/*` only.** Hono's `/waitlist/*` also matches `/waitlist`; registering both counted each join twice. The limiter options (`waitlistLimit`, `recordWaitlistRefusal`) stay local to `createApp`; 030 attaches its form route in the same block rather than importing them.
- **`waitlistJoinSchema` trims and lower-cases `email`** before validating, so a padded upper-case address is accepted and matches the same row (the plan expected only the service to normalize).
- **`markInvited` and `remove` record no decision events yet.** They have no caller in 028; 032 adds the events with the admin actor.
- **T054–T056** (PLAN.md demo ticks, quickstart on the deployed instance, converge) wait for the deploy.
