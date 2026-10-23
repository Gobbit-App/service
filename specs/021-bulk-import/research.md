# Research: Bulk import of notes

Decisions continue the project-wide D numbering. Phase 8 reserves D174–D191. This feature owns **D189–D191**; none needs an ADR (they reuse the ingestion model, ADR-045–048, and P5.9's direct-proposal path).

## What exists today

- `proposeDirect` (P5.9 A2): an already-structured draft becomes a `proposed` card plus a job, with category resolution, dedup and the review queue, and no fetch, extraction or LLM call. PLAN.md: "Bulk import uses the same direct-proposal path as MCP".
- Caps: `INGEST_DAILY_CAP` (50) per user and channel, overridable per channel; `INGEST_COMBINED_DAILY_CAP` (200) across channels.
- Review: one proposal at a time (`POST /items/{id}/publish` with optional edits or merge target).

## D189 — Parsing

- **Decision**: a pure parser in `@pb/shared/import`, run on the device (preview) and in the CLI. Rules:
  - **Lines**: one card per non-empty line. A line that is only a URL → link card. `title — body`, `title – body` or `title: body` (first separator, title ≤ 80 chars) → split. Otherwise the first sentence (≤ 80 chars, at `.`, `?`, `!` or a line break) is the title and the full line the body. Any URL in the line becomes `sourceUrl`.
  - **Markdown**: `#`-headings set the current category name; list items and paragraphs become cards (same line rules); `---`, code fences and images are skipped.
  - **CSV**: header row required; columns `title`, `body`, `category`, `url` (case-insensitive, extra columns ignored); parsed with `papaparse`.
  - **Detection**: `.csv` → csv; `.md` or a `#` heading line → markdown; else lines. The screen lets the admin switch.
  - Each row is validated with the card schemas; invalid rows carry the reason.
- **Rationale**: deterministic results are previewable, free, offline, and testable with fixtures. Notes are already short, one fact per line; an LLM adds cost and surprises for little gain.
- **Alternatives considered**:
  - **LLM extraction per note** (the share path): costs per row, needs a key, results differ between runs, and can't be previewed before import.
  - **Server-side parsing**: no instant preview; the server would still need the preview round trip.
  - **Hand-written CSV**: breaks on quoted fields and embedded newlines from spreadsheet exports.

## D190 — Import endpoint and channel

- **Decision**: `POST /decks/{id}/imports` with `{ label, rows }` (≤ 100 rows), permission `item.publish`. Each row → `proposeDirect` with channel `import`, `clientLabel = label` (shown as "Pasted notes (Imported)" in review). The `import` channel cap is 500 rows a day per user; `import` jobs don't count toward the combined cap. Rows run sequentially; a cap hit stops the loop, and the rest are reported as `failed` with `/problems/rate-limited`. The CLI chunks a file into requests of 100.
- **Rationale**: the channel separates imports in review, caps and the activity log (`via: ingest`) without a new table. Admin-only because admins review; editors keep sharing one card at a time. Excluding `import` from the combined cap keeps one big import from blocking the admin's normal sharing for a day.
- **Alternatives considered**: an `imports` table with batch status (more state for a few-times-per-deck action; `clientLabel` already groups); pg-boss job per import (async progress UI; revisit if the 100-row request is too slow); reuse channel `paste` (mixes imports with single pastes in caps and labels).

## D191 — Bulk publish

- **Decision**: `POST /decks/{id}/review/publish` with `{ ids }` (≤ 50), permission `item.publish`. Each id runs the existing publish (no edits, no merge target) in its own transaction, so one failure doesn't roll back the rest. Skips: proposals whose dedup verdict is `possible_duplicate` or `update` (`needs-decision`), ids not `proposed` or not in the deck (`already-handled`). The review list gains `?source=<clientLabel>`; the PWA adds select mode and "Publish selected".
- **Rationale**: "reviewed and published in one sitting" needs batch publishing; duplicates still need a human decision, so they're left in place.
- **Alternatives considered**: one transaction for the whole batch (one bad row blocks the batch); "publish all from an import" without selection (less control); bulk discard too (useful, but not needed for the demo; same pattern later).
