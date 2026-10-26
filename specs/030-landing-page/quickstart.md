# Quickstart: Landing page

Validates the feature end to end. Emails use `example.test`. Mail goes to the Console mailer locally.

## 1. Automated

```bash
pnpm lint && pnpm typecheck && pnpm test:unit
pnpm test:int                       # landing.int.test.ts (Docker)
pnpm budget                         # SPA change stays within the 150 KB budget
pnpm test:e2e --grep @smoke         # landing.spec.ts: root routing + preview tags (GET only)
pnpm test:e2e --grep @full          # form journeys, stale cookie (local stack only)
```

## 2. Root URL routing (Compose stack, Caddy on :8080)

```bash
pnpm compose:up
curl -s http://127.0.0.1:8080/ | grep -E 'og:(title|image|url)|<form|<script'
#   → og:title, og:image …/og/landing.png, og:url …/ ; a <form method="post" action="/welcome">; no <script>
curl -sI http://127.0.0.1:8080/og/landing.png | grep -iE '^(HTTP|content-type)'
#   → 200, image/png
curl -s -H "Cookie: gobbit_session=$SMOKE_SESSION_TOKEN" http://127.0.0.1:8080/ | grep -c 'id="root"'
#   → 1 (the SPA shell, not the landing page)
curl -s http://127.0.0.1:8080/sitemap.xml | head -5
#   → the root is the first <loc>
```

## 3. The form without JavaScript (demo 3, part 2)

1. In a phone-sized browser window, disable JavaScript and open `http://127.0.0.1:8080/` with no session.
2. Fill email `parent@example.test`, choose "My family", submit. Time it: under 30 seconds from page load.
3. The URL becomes `/welcome?joined=1` with "Check your email to confirm". Reload: no second mail in the API log.
4. The API log shows the confirmation mail; open its link → `/welcome?confirmed=1` "You're on the list". Open it again → `/welcome?confirm=invalid`.
5. Submit `not-an-email` with a note: the form returns with a message next to email and the note kept.
6. Submit `parent@example.test` again: same "check your email" state (no hint that it is known).

## 4. Members and signed-out app

1. Sign in normally; open `/`: the app, no landing page.
2. Open `/welcome` while signed in: "Open Gobbit", no form.
3. Sign out (cookie cleared); open `/`: the landing page.
4. Install the PWA, sign in, then expire the session (delete its `sessions` row in psql); reopen the app: it lands on `/welcome`.

## 5. Deployed instance (demo 3, part 1)

1. After deploy, smoke passes (`/` anonymous = landing with OG tags; with the smoke session = app).
2. Paste the root URL into a WhatsApp chat: the preview shows "Gobbit", the description and the landing image.
3. On a phone, fill the form once with a real address you control and confirm it (owner check; not automated, so production gets no test rows).
4. Resubmit the sitemap in Search Console.
