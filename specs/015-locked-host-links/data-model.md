# Data Model: Links from locked social hosts

**No migration.** This feature uses the tables, enum values and payload fields added by [`012-media-assets`](../012-media-assets/data-model.md) and [`014-link-snapshots`](../014-link-snapshots/data-model.md).

## Fields used

| Where | Field | Use here |
|-------|-------|----------|
| link payload | `preview.title`, `preview.description` | Title from OG or the extracted title; caption as the description (D167) |
| link payload | `preview.publicId`, `width`, `height` | The first shared image or an editor upload; dimensions are server-owned (D160) |
| `assets.source` | `editor` \| `ingest` \| `link_snapshot` | Only `link_snapshot` previews are dropped when the URL or remote image changes (D167) |
| `link_checks.status` | `unchecked` | Written for locked hosts, never probed (D168) |
| `ingest_jobs.raw` | `text`, `url`, `images[0]` | Caption, post URL and preview photo (D167) |

## Shared code (`@gobbit/shared/links`, zod-free)

| Export | Value |
|--------|-------|
| `LOCKED_HOSTS` | `instagram.com` → Instagram, `facebook.com` → Facebook, `fb.watch` → Facebook, `threads.net` → Threads, `tiktok.com` → TikTok, `x.com` → X, `twitter.com` → X, `linkedin.com` → LinkedIn |
| `lockedHostOf(url)` | `{ host, label } \| null`; `http(s)` only; exact host or a subdomain on a dot boundary |
| `LOCKED_CAPTION_MAX` | `500` code points |

## Rules

| Rule | Enforced in |
|------|-------------|
| Locked-host shares are link cards | `ai/extract-validate.ts` (`validateProposal`) and the direct draft path |
| A member-added preview photo survives URL changes | `services/items.service.ts` (server-owned preview fields, refines D163) |
| The snapshot job never replaces a set `preview.publicId` | `jobs/link-snapshot.ts` |
| Locked hosts are never probed or flagged | `services/link-checks.service.ts` (`sweep`, `checkNow`) |

## State: `link_checks` row for a locked-host card

```text
(no row) ──sweep──▶ unchecked (next_check_at = now + 30 ± 3 days) ──sweep──▶ unchecked …
                                     │
                     host removed from LOCKED_HOSTS
                                     ▼
                         normal 014 states (ok/dead/changed)
```
