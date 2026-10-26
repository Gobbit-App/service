# Quickstart: Landing page analytics

How to check that 031 works: automated tests, a local run with Umami, and demo 4 on the deployed site.

## 1. Automated

```bash
pnpm test:unit        # analytics tag, layout opt-in per page type, env parsing, Caddyfile /stats routes
pnpm typecheck
pnpm build:web        # dist/index.html carries no /stats/ tag
pnpm test:e2e         # @smoke landing journey: no tag when ANALYTICS_SITE_ID is unset
```

## 2. Local, with Umami

```bash
# Postgres: create the Umami database once (local defaults, not secrets)
psql "$DATABASE_URL" -c "create role umami login password 'umami'" -c "create database umami owner umami"

pnpm compose:up -- --profile analytics   # adds the umami service on 127.0.0.1
```

1. Open the Umami dashboard on its local port, log in with the default admin, change the password.
2. Add a website (domain `localhost`), copy its id.
3. Set `ANALYTICS_SITE_ID=<id>` in the repo-root `.env`, restart the API.
4. Open `http://127.0.0.1:8080/welcome` in a private window:
   - page source has one `<script defer src="/stats/script.js" …>`;
   - DevTools Network: `/stats/script.js` 200 and a `POST /stats/api/send` 200, both same origin; Console: no CSP error.
5. Submit the form with `someone@example.test` → `/welcome/joined`; the dashboard shows two page views, one on `/welcome/joined`.
6. Open `/p/<a public deck>`, `/auth/error`, and the app (signed in): no `/stats/` request.
7. `curl -i http://127.0.0.1:8080/stats/login` → 404 (dashboard not on the app origin).
8. Unset `ANALYTICS_SITE_ID`, restart: `/welcome` has no tag, the form still works.

## 3. Deployed — demo 4

After the rollout steps in [plan.md](./plan.md#rollout):

1. In a browser you use yourself, open DevTools on the landing page and run `localStorage.setItem('umami.disabled', '1')` so your own visits are not counted.
2. From another device (or a private window without the opt-out), visit `/` signed out and `/welcome?utm_source=demo`; join with an `example.test` address.
3. In the dashboard on the stats host, choose **Last 7 days**: visitors, views, the `demo` UTM source and the referrer list are shown.
4. Open the funnel landing → `/welcome/joined` for the conversion rate.
5. Compare with the waitlist count:
   ```sql
   select * from waitlist_summary order by week desc limit 2;
   ```
   Analytics conversions ≤ the table count (blockers and DNT undercount; the table is authoritative).
6. Signed in, open `/` and a public deck page: no request to `/stats/` in DevTools.
