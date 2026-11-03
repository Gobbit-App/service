# Contract: Analytics consent (035)

Extends [033's contract](../../033-app-analytics/contracts/analytics.md). `/config` is unchanged; every tag loses `data-do-not-track`.

## 1. `GET /me` (changed)

```jsonc
{
  "user": { "id": "…", "email": "…", "displayName": "…" },
  "decks": [ … ],
  "isPlatformAdmin": false,
  "analyticsConsent": { "value": "unanswered", "at": null, "source": null }
}
```

## 2. `PUT /me/analytics-consent` (new, session or bearer; not `ing_` tokens)

Request: `{ "value": "allowed" | "declined", "source": "prompt" | "settings" }` (unknown keys rejected).

| Status | When | Body |
|--------|------|------|
| 200 | saved, or already that value | `AnalyticsConsent` |
| 400 | invalid body | problem+json |
| 401 | no session | problem+json |
| 403 | CSRF check failed (existing middleware) | problem+json |

Acts only on the caller's own user. The 200 is the same whether the value changed or not.

## 3. SPA tracker tag (lazy chunk)

As 033 §2 without `data-do-not-track`. Appended only while `analyticsAllowed(me.analyticsConsent.value, deviceChoice)` holds.

## 4. API-rendered pages (landing, `/p/…`, `/s/…`) when `ANALYTICS_SITE_ID` is set

Head (no Umami tag any more):

```html
<script defer src="/analytics/page.js" data-website-id="{siteId}" data-domains="{host}"
        data-pattern="/p/:deck" data-screen="Public deck"></script>   <!-- pattern/screen absent on the landing -->
```

Body, right after the site header (landing and `/p/…`; the share preview has no body content):

```html
<section class="consent" data-consent-banner aria-label="Analytics choice" hidden>
  <p>{banner copy}</p>
  <p data-consent-current hidden></p>
  <div class="consent-actions">
    <button type="button" data-consent-choice="allowed">OK</button>
    <button type="button" data-consent-choice="declined">No thanks</button>
  </div>
</section>
```

And a reopen control in the landing privacy note and the `/p/…` footer: `<button type="button" class="consent-open" data-consent-open hidden>Analytics</button>`.

`page.js` then injects (unless declined):

```html
<script defer src="/stats/script.js" data-website-id="{siteId}" data-host-url="/stats" data-domains="{host}"
        data-before-send="__gobbitAnalyticsBeforeSend"
        data-exclude-search="true" data-exclude-hash="true"></script>  <!-- exclude-* only with a pattern -->
```

Unconfigured: no script, no banner, no button. Error pages, sitemap, robots: never.

## 5. Decision events

```jsonc
{ "event": "analytics.consent", "outcome": "changed", "from": "unanswered", "value": "declined",
  "source": "prompt", "userId": "…", "requestId": "…" }
{ "event": "analytics.consent", "outcome": "unchanged", "value": "declined", "source": "settings", "userId": "…", "requestId": "…" }
{ "event": "analytics.config", "outcome": "enabled", "host": "gobbit.example",
  "surfaces": "landing,app,public,share", "consent": "opt_out", "bootId": "…" }
```
