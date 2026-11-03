# Quickstart: Analytics consent (035)

## Automated

```bash
pnpm db:migrate && pnpm db:rollback && pnpm db:migrate   # 0020 round trip
pnpm test:unit                # rule table, sanitiser gate, facade, page.js loader, tags, service, prompt, settings
pnpm test:int                 # audit row in the same tx, /me shape, own-user only, pages render page.js + hidden banner
pnpm budget                   # initial chunks within budget
pnpm test:e2e --grep @smoke   # journeys unchanged; landing head
pnpm test:e2e --grep @full    # analytics-consent.spec (stubbed tracker)
```

## Manual (with Umami, see `infra/README.md` § Analytics)

1. Set `ANALYTICS_SITE_ID`, `pnpm compose:up` with the `analytics` profile. The API log shows `analytics.config` `enabled` with `consent: "opt_out"`.
2. Turn on Do Not Track. Sign in: the prompt shows above the page, and `/stats/api/send` requests go out with your user id.
3. Choose "No thanks": no further `/stats/` requests. In a second browser profile, sign in as the same member: no prompt and no `/stats/` requests. Settings → Privacy shows "Off" with today's date; switch it on: the next screen sends a view, no reload.
4. Counts (FR-007, D265):

   ```sql
   select coalesce(analytics_consent::text, 'unanswered') as choice, count(*)
     from users where deleted_at is null group by 1 order by 1;
   ```

   History: `select from_value, to_value, source, created_at from analytics_consent_events order by created_at desc limit 20;`
5. Signed out, open `/welcome`: the banner shows under the header. "No thanks" → open a public deck `/p/{slug}`: no banner, no `/stats/` request (not even `script.js`). Press "Analytics" in the footer → "OK" → a view is sent. DevTools → Application: no cookie; `localStorage['gobbit.analytics.consent']` holds the choice.
6. Disable JavaScript: no banner, no "Analytics" button, the page works.
7. Unset `ANALYTICS_SITE_ID`: no prompt, banner or button anywhere; Settings → Privacy says the server doesn't measure usage.
