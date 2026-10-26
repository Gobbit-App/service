# Quickstart: Registration gate

Validates [spec.md](./spec.md) end to end. Setup per `README.md`; 028 merged (030 for the `/welcome` links). Contract: [auth-gate](./contracts/auth-gate.md).

## 1. Automated

```sh
pnpm test:unit                 # users.service register table, auth.service gate, env, web copy
pnpm test:int                  # auth.int (gate matrix, both modes), members.int (invite with gate on)
pnpm api:openapi && git diff --exit-code packages/api-client   # expect no diff
pnpm test:e2e -- smoke/web.spec.ts full/registration-gate.spec.ts
```

## 2. Closed door (local, `REGISTRATION_MODE` unset)

1. `pnpm dev` with `MAIL_PROVIDER=console`.
2. Open `/sign-in`, enter `newcomer@example.test`. The screen shows the shared "check your inbox" message.
3. The API console shows the "You're not on Gobbit yet" mail, not a sign-in link. `select status, source from waitlist_entries where email = 'newcomer@example.test'` → `pending`, `sign_in`.
4. Open the mail's link → the landing page's confirmed state; the entry is `confirmed`. You are not signed in.
5. Request again → no new mail (already confirmed); the screen answers the same.

## 3. Stale link

1. Set `REGISTRATION_MODE=open`, restart, request a link for `late@example.test`; don't click it.
2. Unset `REGISTRATION_MODE`, restart, click the link → "Gobbit is invite-only for now" with "Join the waitlist". No `users` row for the address.

## 4. Invited people still get in

1. As the seeded owner, invite `neighbour@example.test` to a shared deck (`api.http` or deck settings).
2. Open the invite link from the console → signed in, deck opens.
3. Sign out; request a sign-in link for the same address → a normal sign-in link arrives and works.

## 5. Deployed instance (demo 1)

Repeat sections 2 and 4 with a real throwaway inbox for the unknown email and a real invitee. Don't set `REGISTRATION_MODE` in Dokploy.
