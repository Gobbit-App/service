# Quickstart: Waitlist with double opt-in

Validates [spec.md](./spec.md) end to end. Setup per `README.md`; no AI key needed. Locally the `ConsoleMailer` prints the confirmation link. Contract: [waitlist-api](./contracts/waitlist-api.md).

## 1. Automated

```sh
pnpm db:migrate
pnpm test:unit                 # schema, templates, service branches, prune factory
pnpm test:int                  # waitlist.int, waitlist-invariants.int, migrations.int (round trip)
pnpm api:openapi && git diff --exit-code packages/api-client
```

## 2. Demo 2 (join, confirm, honeypot)

With `pnpm dev` running (API on :3000):

```sh
curl -si -X POST http://127.0.0.1:3000/waitlist \
  -H 'content-type: application/json' \
  -d '{"email":"parent@example.test","kind":"family","note":"School and clinic numbers","utmSource":"demo"}'
# → 202 {"ok":true}; the API log prints the confirmation mail with its link

psql "$DATABASE_URL" -c "select status, kind, source, utm_source from waitlist_entries where email = 'parent@example.test'"
# → pending | family | landing | demo

# open the printed link (…/waitlist/confirm?token=…) in a browser or with curl -si
# → 303 Location: <APP_URL>/welcome?confirmed=1 (200 {"confirmed":true} without APP_URL)
# → the row now reads confirmed; opening the link again → ?confirm=invalid

curl -si -X POST http://127.0.0.1:3000/waitlist \
  -H 'content-type: application/json' \
  -d '{"email":"bot@example.test","kind":"other","website":"http://spam.example.test"}'
# → the same 202 {"ok":true}; no row for bot@example.test, no mail printed,
#   one {"event":"waitlist.join","outcome":"dropped","reason":"honeypot",…} line with hashes, no address
```

Also check: the same request with the owner's email (`SEED_OWNER_EMAIL`) answers the same `202` and prints the "you already have an account" mail; no row is created.

Read the decisions (constitution VIII):

```sh
# pnpm dev logs: pipe through jq, or with Compose: docker logs <api> | …
… | jq -c 'select(.event|test("^waitlist\\.|^rate_limit\\.")) | {event, outcome, reason}' | sort | uniq -c
psql "$DATABASE_URL" -c "select action, source, actor_id, created_at from waitlist_events order by created_at"
# → created, confirmed (no email in either table row)
```

Lower a limit and watch the refusal: restart the API with `WAITLIST_JOIN_PER_EMAIL_PER_HOUR=1`, join the same address twice → the second answers `429` and logs `waitlist.join` `refused`/`per_email`.

## 3. Demo 6 (summary view)

```sh
psql "$DATABASE_URL" -c "select * from waitlist_summary order by week desc, kind, source, status"
```

Expect one row per (week, kind, source, status) with counts; after 032 invites someone who then signs in, their entry counts as `joined`.

## 4. Deployed instance

After deploy: join with a real address you control, confirm from the inbox, check the row, its `waitlist_events` rows and the view on the server's database, and check that the decision events appear in the API logs. Then delete the test entry. Tick demo 2's waitlist half and demo 6 in `PLAN.md` (the landing form half of demo 2 closes with 030).
