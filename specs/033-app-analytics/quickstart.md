# Quickstart: App analytics (033)

## Automated

```bash
pnpm test:unit                # sanitizer, catalogue, facade, tracker loader, page.js, tags, config
pnpm test:int                 # public pages carry pattern-only tags when configured; error pages never
pnpm budget                   # initial chunks unchanged; the tracker chunk is not initial
pnpm test:e2e --grep @smoke   # analytics off → zero /stats/ requests
pnpm test:e2e --grep @full    # app-analytics.spec: stubbed tracker, sentinel scan (SC-003)
```

## Manual (with Umami, see `infra/README.md` § Analytics)

1. Set `ANALYTICS_SITE_ID`, then run `pnpm compose:up` with the `analytics` profile. The API log shows `analytics.config` `enabled` with `surfaces`.
2. Sign in and do the following:
   - open a deck named "Smith family"
   - open a card
   - search "allergy"
   - open a category
   - create a card

   Then open DevTools → Network → `/stats/api/send`. Every body should hold only patterns (`/d/:deck`, `/i/:item`, `/d/:deck/search`, …), screen names, UUIDs and fixed labels. `payload.id` should be your user id, and there should be one `card-created` event.
3. Sign out and sign in as another member. The next request carries the new id and no `x-umami-cache` header.
4. **Weekly cross-check** (operator, D250). Take Umami's `card-created` events with channel `editor` + `review` for the week and compare them with:

   ```sql
   select count(*) from item_events
    where kind = 'created' and via = 'session'
      and created_at >= now() - interval '7 days';
   ```

   Raise an alert in either case:
   - Umami is higher than the log, or below 50% of it two weeks running.
   - Umami shows zero app views in 24 h while `analytics.config` is `enabled` and sessions were created.
5. Unset `ANALYTICS_SITE_ID` and redeploy. `/config` shows `"analytics": null`, and nothing requests `/stats/` anywhere (public pages, `/s/…`, the app).
6. Turn on Do Not Track. Nothing is sent.
