# Implementation Plan: Links from locked social hosts

**Branch**: `015-locked-host-links` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 7 (demo 4)

**Input**: Feature specification from `/specs/015-locked-host-links/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

Links to social apps that hide their pages behind a login become useful cards from what the member shared:

- One registry of locked hosts, with labels, in `@gobbit/shared/links` (D166).
- Ingest forces a link card for these URLs and builds its preview from the OG data when it is usable, else from the shared caption and the first shared image (D167).
- The link editor gets "Add photo" for every link card, and a member-added photo survives URL changes.
- `LinkCard` shows the host's label. 014's snapshot job tries these pages once, and 014's link checks record them as `unchecked` without contacting the host (D168).

No migration and no new route. This extends ADR-055.

## Starting point

- `main` with [`012-media-assets`](../012-media-assets/plan.md) and [`014-link-snapshots`](../014-link-snapshots/plan.md) merged. [`013-cloud-image`](../013-cloud-image/plan.md) is preferred for `CloudImage` but not required.
- `apps/api/src/jobs/ingest.ts:81–91`: `validate` context = `sourceUrl` (`job.raw.url ?? source.url`) + `imagePublicId` (`job.raw.images[0]`) + `categoryIds`.
- `apps/api/src/ai/extract-validate.ts:124–138`:
  - The type falls back from `image` to `link` only when there is no image.
  - After 014, a link payload is `{ url, preview }`, with the preview from `og`.
- `packages/shared/src/schemas/ingest.ts`: `IngestRaw = { text?, url?, title?, images[] }`; `OpenGraph = { title, description, image, siteName }`.
- After 012:
  - `jobs/link-snapshot.ts` and `services/link-checks.service.ts` (`sweep`, `checkNow`) exist;
  - `link_check_status` includes `unchecked`;
  - the link payload preview has `publicId`/`width`/`height`;
  - `items.service` drops snapshot fields on URL change.
- Web:
  - `cards/LinkCard.tsx` shows `link-card__domain` (hostname without `www.`).
  - `editor/fields/LinkEditorFields.tsx` passes `FetchPreview` into `LinkFields`' `previewSlot`.
  - `editor/fields/ImageFields.tsx` uses `useImageUpload({ onUploaded })` (D133).

## Technical Context

**Language/Version**: TypeScript (strict, ESM), Node ≥ 22 — Hono API + pg-boss worker; React 19 PWA

**Primary Dependencies**: existing only (Drizzle, pg-boss, Cloudinary SDK, TanStack). No new dependencies.

**Storage**: Postgres 17 (no schema change); Cloudinary (existing assets)

**Testing**: Vitest unit; Vitest integration with Docker Postgres (`MemoryMediaStore`, fake extractor); Playwright `@full`

**E2E tier**: full — the label and "Add photo" on link cards are secondary paths, and the share journey (pasted text, fake LLM) is unchanged; ingest rules are integration-tested (constitution V)

**Target Platform**: Linux containers (Dokploy); evergreen mobile and desktop browsers

**Project Type**: pnpm monorepo — API, worker, web, shared packages

**Performance Goals**: no extra outbound requests for locked hosts beyond one optional snapshot fetch per card; no change to ingest latency

**Constraints**: `@gobbit/shared/links` stays zod-free (web bundle); plain CSS; no scraping behind logins

**Scale/Scope**: 8 host entries; affects every link card render (one string check)

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | Rules in `extract-validate`, `items.service`, `link-checks.service`; no route logic |
| II. One source of truth | One `LOCKED_HOSTS` registry used by API and web |
| III. Invariants in the DB | No new invariant; the D160 asset reference check (service, backed by the `assets` FK data) is reused |
| IV. Private by default | Fewer outbound requests (no probes); stores only what the member shared or uploaded |
| V. Tests at the right tier | Unit (registry, validator, card, editor), integration (ingest, update rule, sweep, manual check), e2e (badge + Add photo); traceability below |
| VI. Lean offline-first web | Registry is a few hundred bytes, zod-free; "Add photo" reuses the editor's upload hook in the editor chunk |
| VII. Simple, optional | No dependency; without Cloudinary there are no shared images, so only the caption and label apply |

No violations.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D166 | `LOCKED_HOSTS` + `lockedHostOf(url)` in `@gobbit/shared/links` (zod-free; exact host or dot-boundary subdomain; `http(s)` only; no redirect following) | no |
| D167 | Locked-host shares are link cards; preview = usable OG, else extracted title + caption (≤ 500) + first shared image as `preview.publicId`; link editor "Add photo"; only `link_snapshot` previews are dropped on URL change | no (extends ADR-055) |
| D168 | `LinkCard` host label; snapshot job tries once and discards generic OG; sweep writes `unchecked` without a probe; manual check → 422 | no (extends ADR-055) |

## Project Structure

### Documentation (this feature)

```text
specs/015-locked-host-links/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/locked-hosts.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md   # created during /speckit-implement
```

### Source Code (repository root)

```text
packages/shared/src/links/
├── locked-hosts.ts                      # NEW: LOCKED_HOSTS, lockedHostOf
├── constants.ts                         # + LOCKED_CAPTION_MAX
└── index.ts                             # re-export

apps/api/src/
├── ai/extract-validate.ts               # ctx.lockedHost, ctx.sharedText → forced link + preview
├── jobs/ingest.ts                       # pass lockedHost + raw.text (and in the direct draft path)
├── services/items.service.ts            # drop only link_snapshot previews on URL/image change
├── repositories/assets.repo.ts          # sourceOf(publicId) (if not already exposed by 012)
├── jobs/link-snapshot.ts                # skip set publicId; locked host: one try, discard generic OG
└── services/link-checks.service.ts      # locked host → unchecked (sweep), 422 (checkNow)

apps/web/src/
├── cards/LinkCard.tsx                   # host label
├── editor/fields/LinkPhoto.tsx          # NEW: Add/Remove photo for preview.publicId (useImageUpload)
├── editor/fields/LinkEditorFields.tsx   # previewSlot renders FetchPreview + LinkPhoto
└── styles.css                           # .link-card__host
e2e/tests/full/links.spec.ts            # + label, Add photo
```

**Structure Decision**: the registry sits with 014's link constants in `@gobbit/shared/links`, so the web imports one zod-free subpath. `LinkPhoto` is its own field component rather than a mode of `ImageFields`, because it edits `preview.publicId` and has no alt text.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 host matching | `locked-hosts.ts` | `locked-hosts.test.ts` (unit: contract §1 table, uppercase, trailing dot, ports, IDN look-alikes) |
| FR-002 forced link type | `extract-validate.ts` | `extract-validate.test.ts` (unit: model picks `image`/`text` → `link`) |
| FR-003–FR-005 preview from OG/caption/image | `extract-validate.ts` | `extract-validate.test.ts` (unit: generic OG ignored, caption trimmed at 500, `publicId` from ctx, no `image`); `ingest-pipeline.int.test.ts` (int: share with locked URL + text + image → proposal payload, dimensions written) |
| FR-006 host label | `LinkCard.tsx` | `LinkCard.test.tsx` (unit); `links.spec.ts` (e2e) |
| FR-007 Add/Remove photo | `LinkPhoto.tsx` | `LinkPhoto.test.tsx` (unit: fake uploader → `preview.publicId`; remove clears); `links.spec.ts` (e2e) |
| FR-008 member photo kept on URL change | `items.service.ts` | `items.int.test.ts` (int: `editor` asset kept, `link_snapshot` dropped) |
| FR-009 no probe, no flag | `link-checks.service.ts` | `link-checks.service.test.ts` (unit: fake fetch never called; `unchecked` row); `link-checks.int.test.ts` (int: sweep row, manual check 422, rate counter unchanged) |
| FR-010 one snapshot try | `link-snapshot.ts` | `link-snapshot.test.ts` (unit: no requeue on failure; generic OG discarded; set `publicId` not replaced) |
| SC-001 demo 4 | — | quickstart section 2 (manual, phone share) |

## Rollout

- **Migrations**: none.
- **Env / config**: none.
- **API client**: no route change. `pnpm api:openapi` only if the 422 example is documented on the route.
- **Deploy order / flags**:
  - After 014 is deployed.
  - Existing locked-host cards get `unchecked` at their next due check. Any flags they already have clear then, because the status changes.
  - Existing image cards that came from locked-host shares are not converted (no backfill). Members can recreate them if they want.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| The share sheet on some platform drops the caption or image | M / M | The editor's "Add photo" and the card body cover it; quickstart checks the two main phone platforms |
| A host changes domain or adds a short link host | M / L | One registry; a one-line change with a unit test |
| Generic OG detection misses a new generic title format | M / L | Caption fallback still fills the description; the title comes from the extractor in that case |
| Users expect locked links to be checked | L / L | Documented; no flag is better than a false one |

## Settle before starting

- [ ] Confirm which phone platforms the quickstart covers (the share payload differs between Android and iOS share sheets).
- [ ] Confirm that no other host should be on the initial list (e.g. YouTube is not locked and stays a normal link).

## Complexity Tracking

None.
