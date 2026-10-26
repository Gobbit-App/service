# Quickstart: Waitlist admin and invite

Validates [spec.md](./spec.md) end to end. Setup per `README.md`; 028 and 029 merged. Contract: [admin-waitlist-api](./contracts/admin-waitlist-api.md).

## 1. Automated

```sh
pnpm test:unit                 # platform-admin guard, env parsing, mail template, admin components
pnpm test:int                  # admin-waitlist.int (404 matrix, invite transaction, onboarding), migrations
pnpm api:openapi && git diff --exit-code packages/api-client
pnpm build:web && pnpm budget
pnpm test:e2e -- full/waitlist-admin.spec.ts
```

## 2. Local walk-through

1. In `.env`: `REGISTRATION_MODE=waitlist`, `PLATFORM_ADMINS=<your SEED_OWNER_EMAIL>`, `MAIL_PROVIDER=console`. `pnpm dev`.
2. Join the waitlist from `/welcome` as `newcomer@example.test` (kind "community"); open the confirmation link printed by the console mailer.
3. Sign in as the seeded owner. Settings shows **Waitlist**. The Confirmed tab lists `newcomer@example.test`.
4. Tap **Invite**. The row moves to Invited with your name and the time; the console prints the "You're in" email.
5. In a private window, open that link. You land in **My deck**, which has the `general` category and no cards. `GET /api/decks` lists exactly that deck.
6. Back as the owner, tap **Resend** on the entry: a second email is printed, still one account.
7. Add a second entry and leave it unconfirmed: **Invite** is not offered on the Pending tab; calling the API gives `409 /problems/waitlist-not-confirmed`.
8. Remove a confirmed entry: it moves to the Removed tab.
9. Sign in as a user not in `PLATFORM_ADMINS`: no Waitlist link; `/admin/waitlist` shows not found; `GET /api/admin/waitlist` → 404.

## 3. Deployed instance (PLAN.md demo 5)

1. Set `PLATFORM_ADMINS` in Dokploy; redeploy.
2. From the phone, invite one real confirmed waitlist entry (with their agreement).
3. They sign in from the email and land in their own empty deck with `general`; the entry shows Invited.
