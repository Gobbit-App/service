# Implementation notes: 015-locked-host-links

Plan: `specs/015-locked-host-links/plan.md`, tasks: `tasks.md`. Branch `worktree-phase7-media` (all of Phase 7), on top of 014.

No migration, queue, env var or dependency. E2E tier: full (`e2e/tests/full/links.spec.ts`).

## Decisions not specified by the plan

- **`fetch/locked-host-preview.ts`** holds `isGenericLockedTitle` / `isGenericLockedPreview`, shared by extract-validate (D167) and the snapshot job (D168). Besides the label and site name, login-wall wording ("log in or sign up", "welcome to") counts as generic.
- **Caption**: the shared URL is stripped from the shared text before it is trimmed to `LOCKED_CAPTION_MAX` on a sentence boundary.
- **OG image**: dropped together with a generic OG title (it is the site logo).
- **Dimensions**: the ingest handler takes an optional `assets` repo (`worker.ts` passes it) to put the uploaded image's `width`/`height` on the preview.
- **Snapshot job**: for locked hosts a failure ends as `superseded` (no requeue); a discarded generic preview ends as `unchanged`.
- **Link checks**: `uncheckedState(now, random)` in `link-checks.service` builds the row; the sweep summary adds `unchecked`.
- **"Remove photo"**: an omitted `publicId` keeps the stored copy (014), so removal needs a signal: `preview.publicId: null` in a write (payload schema `nullable().optional()`). `link-preview-fields` drops the stored copy and never stores null. The web sends null and drops `image`/`width`/`height`, so the snapshot job has nothing to copy back.
- **Web**: `PickButton` was extracted from `ImageFields` for reuse by `LinkPhoto`. `LinkCard` keys its image-fallback state by `publicId|image`, so the editor preview shows a newly added photo after an earlier load failure.
- **E2E**: the fake Cloudinary helpers moved from `tests/smoke/editor.spec.ts` to `e2e/fixtures/cloudinary.ts`. Locally, a fake `CLOUDINARY_URL` plus the matching `CLOUDINARY_API_SECRET` for the e2e run lets the save journeys run without reaching Cloudinary (signature verification is local).

## Deviations from the plan

- **T014**: there is no extractor-off ingest path (`POST /ingest` answers 503 without a provider key), so only the worker's extraction branch applies the locked rules; direct proposals (P5.9) don't.
- **T042**: the 422 for a manual check is in `items.service.checkLink` (where 014 put the other manual-check rules), using `unprocessableField('url', …)`.
- **T032/T033**: already covered by 014's `link-preview-fields` (`editor`/`ingest` assets survive a URL change, `link_snapshot` ones don't); T031 is covered by the 014 `items.int` tests plus the new null-removal unit test.
- **T034**: `LinkPhoto` CSS lives in `editor/editor.css` with the other editor field styles, not `styles.css`.
