# Data model: Analytics consent (035)

## `users` (new columns, D259)

| Column | Type | Rule |
|--------|------|------|
| `analytics_consent` | enum `analytics_consent` (`allowed`, `declined`), null | null = not answered (every existing member) |
| `analytics_consent_at` | `timestamptz(3)`, null | when the current value was set |
| `analytics_consent_source` | enum `analytics_consent_source` (`prompt`, `settings`), null | where it was set |

CHECK `users_analytics_consent_complete`: the three columns are all null or all set.

## `analytics_consent_events` (new, D259)

Append-only; one row per change, inserted in the same transaction as the `users` update.

| Column | Type | Rule |
|--------|------|------|
| `id` | uuid PK | |
| `user_id` | uuid, FK `users.id` on delete cascade | the member (also the actor: only they can change it) |
| `from_value` | `analytics_consent`, null | null = not answered |
| `to_value` | `analytics_consent`, not null | differs from `from_value` (CHECK `from_value is distinct from to_value`) |
| `source` | `analytics_consent_source`, not null | |
| `request_id` | text, not null | the API request id |
| `created_at` | `timestamptz(3)`, default now() | |

Indexes: `(user_id, created_at)`, `(created_at)`. No email, IP or user agent.

## State transitions (member)

```
unanswered ──Allow──────▶ allowed ◀──settings──▶ declined
     └──────No thanks─────────────────────────────▲
```

There is no transition back to unanswered (no bulk reset, spec assumption). The same value again is a no-op with no row.

## `AnalyticsConsent` (DTO, `@gobbit/shared`)

| Field | Type | Rule |
|-------|------|------|
| `value` | `'unanswered' \| 'allowed' \| 'declined'` | from the column (null → `unanswered`) |
| `at` | ISO string \| null | null when unanswered |
| `source` | `'prompt' \| 'settings' \| null` | null when unanswered |

`SetAnalyticsConsent` (request): `{ value: 'allowed' | 'declined', source: 'prompt' | 'settings' }`, strict.

## Visitor choice (browser only, D264)

`localStorage['gobbit.analytics.consent']` = JSON `{ "value": "allowed" | "declined", "at": "<ISO 8601>" }`. Anything missing, unparsable or with another value reads as not answered. Never sent; never written by the SPA on the member's behalf; read by the SPA only to apply FR-010.

## Rule (D261)

`analyticsAllowed(member: 'unanswered' | 'allowed' | 'declined' | null, device: 'unanswered' | 'allowed' | 'declined'): boolean` — table in [research.md](./research.md#d261--one-rule-decides-whether-anything-is-sent).
