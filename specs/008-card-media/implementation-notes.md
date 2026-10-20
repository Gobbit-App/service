# Implementation notes: 008-card-media

Plan: `specs/008-card-media/plan.md`, tasks: `tasks.md`. Branch `feat/008-card-media`, stacked on `feat/007-card-editor` at `5b40d50`.

No migration, no new env vars (`CLOUDINARY_URL` now also signs editor uploads), no new dependencies (`cloudinary` and `lru-cache` were already in `apps/api`).

## Bundle (T050)

| | Initial JS (gzip) |
| --- | --- |
| Baseline, 007 head `5b40d50` | 112.5 KB |
| 008 | 112.5 KB |

The image fields, upload helper and Fetch preview live in the editor's lazy chunks (`CardEditor` chunk 7.4 KB gzip). Web code imports only `@pb/shared/media-constants` (no zod).

## Settled before starting (plan, "Settle")

- **No signed upload preset.** Signed params (folder, tags, formats) plus the client-side 8 MB check; Cloudinary's account upload limit is the server-side backstop. A signed preset with a size cap can be added later by signing its name; the client would not change.

## Decisions not specified by the plan

- **Schemas in `packages/shared/src/schemas/media.ts`**, re-exported from `@pb/shared` and `@pb/shared/media`. The limits are in `media/constants.ts`, exported as the zod-free `@pb/shared/media-constants`, which the web imports (research named `@pb/shared/media`, which would pull zod into the editor chunk).
- **`LINK_PREVIEW_IMAGE_URL_MAX` = 2048**: an OG image URL longer than that, or not absolute http(s), is dropped.
- **Cache key** is the parsed URL (`new URL(url).href`), so trivially different spellings share an entry. Empty results (`null`) are cached too, wrapped because `lru-cache` can't hold `null`.
- **Order of checks**: deck lookup and `authorize` first on both routes, so non-members learn nothing. The sign route then answers 503 without Cloudinary before counting the rate limit, so a server without Cloudinary doesn't use up the hourly count. The preview rate limit is counted before the cache, so cache hits count too.
- **Signature lifetime**: `expiresAt` is 50 minutes after the timestamp, inside Cloudinary's one-hour window. `cachedSigner` reuses a signature until then; an upload rejected as stale is re-signed once.
- **Upload state**: starting an upload clears the stored `publicId`; cancelling or a failure leaves no photo, also when replacing one (Save then asks for a photo). A restored draft keeps only a finished `publicId`. Offline, picking is disabled with "Photos can be added once you are back online."
- **Error messages** for the sign call: 429 → "Too many uploads right now. Try again later." (retry), 503 → "Image uploads are not available here.", 403/404 → "You can't add photos to this pocketbook."; other failures offer "Retry upload".
- **File type check** uses the MIME type, or the extension when the browser reports none (common for HEIC on some browsers).
- **Alt text has no client maximum**; the server has none either, and the 8192-byte payload limit covers it.
- **Image unavailable**: without a cloud name in `GET /config`, the type picker disables Image with "Image cards aren't available: image storage isn't set up here." (unless the card is already an image), and `/d/$slug/new?type=image` falls back to text.
- **Fetch preview merge**: text the member already wrote (non-blank title/description) wins over fetched text, a fetched image replaces the old one, unknown keys are kept, and an empty card title takes the fetched title. Any failure (null, 429, network) reads "No preview available" and changes nothing.
- **Fetch preview only in the card editor** (`LinkEditorFields` in the registry); the review queue's inline edit keeps plain `LinkFields`.
- **Caddy `Permissions-Policy: camera=()`** stays: `<input capture>` opens the system camera and is not affected.

## Deviations from the plan

- **8 MB, not 10 MB**: the same cap as ingest images (`INGEST_IMAGE_MAX_BYTES`).
- **No width/height** in the image payload; the card stores `{ publicId, alt }` as the existing schema does.
- **No `siteName`** in the preview: the link payload has no field for it.
- **The fetch failure reason is not returned**, only logged (`[link-preview] no preview: …`).
- **`use-image-upload.ts` is not a TanStack mutation** (the plan's structure said "sign (TanStack mutation)"). Sign and upload are one sequence with progress, cancel and a single re-sign, so the hook keeps its own state and takes an injectable `Signer` (`cachedSigner` over `signMediaUpload`) and upload function, which the field tests replace. "Fetch preview" (`use-link-preview.ts`) is a mutation as planned.
- **`ImageCard` is keyed by `publicId`** in `CardBody` (convergence T057), so a replaced photo in the editor preview starts without the previous photo's load error.
- **E2E fakes (T015, T033)**: the smoke specs answer `/api/config` (with a cloud name), `/api/decks/*/media/sign`, `https://api.cloudinary.com/**` and `https://res.cloudinary.com/**` through `page.route`, so no test talks to Cloudinary or needs credentials, and T015 runs instead of being skipped without a cloud name. The happy-path preview (T033) is also faked with `page.route`: `safe-fetch` refuses the loopback fixture server the task described, by design. The no-preview path goes through the real API with a private-IP URL (`http://10.0.0.1/private`).

## Gates (T050)

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`: pass.
- `pnpm test:unit`: 2010 passed (baseline 1929); 2011 after convergence (T057).
- `pnpm test:int`: 44 files, 396 passed (baseline 381).
- `pnpm build:web && pnpm budget`: 112.5 KB of 150 KB.
- `pnpm api:openapi`: no drift after regeneration.

## E2E run (local)

Against `pnpm dev` (API :3000, web :5173) and a throwaway pgvector Postgres, migrated and seeded with a local smoke token:

- `editor.spec.ts`: 15 / 15 passed (5 new: image happy path, image without alt blocked, image unavailable, fetch preview filled, no preview available).
- `--grep @smoke`: 48 passed, 2 failed. The failures are `web.spec` (`/version.json`) and `share.spec` (failed-share redirect); both need Caddy and fail the same way on the base branch.

## Quickstart validation (T055, not done)

Section 3 needs a phone on the deployed instance with real Cloudinary credentials (including the iPhone HEIC step), which this branch has not reached, so T055 stays unchecked. Local coverage:

| Step | Covered locally by |
| --- | --- |
| 2.1 Sign response, no secret | `media.int.test.ts`, `sign-upload.test.ts` |
| 2.2 503 without Cloudinary | `media.int.test.ts`, `media.service.test.ts` |
| 2.3 Reader 403, unknown deck 404 | `media.int.test.ts`, `link-preview.int.test.ts` |
| 2.4 Preview title | `link-preview.int.test.ts` (fixture page through an injected fetch) |
| 2.5 Local address → `null` | `link-preview.int.test.ts`; e2e no-preview spec |
| 2.6 Rate limit 429 | both int tests (per-user hourly limit) |
| 3.1–3.3 Take, cancel, replace, alt required | `ImageFields.test.tsx`, `upload.test.ts`, `CardEditor.test.tsx`; e2e image specs (faked Cloudinary) |
| 3.4–3.5 Fetch preview, no preview | `FetchPreview.test.tsx`; e2e fetch preview specs |
| 3.6 iPhone HEIC | `image-file.test.ts` (type by extension); real device not run |
| 3.7 Demo 1 | not run; `PLAN.md` Phase 6 demo 1 stays unticked |

`PLAN.md` Phase 6 demo 1 stays unticked (T054): it needs a run on the deployed instance with 007.

## Convergence (T056)

One `/speckit-converge` run. It checked FR-001 to FR-016, SC-001 to SC-005, the acceptance scenarios of US1 to US3, the edge cases, D129, D133, D134 and the constitution principles. Nothing contradicts the spec and nothing unrequested was found. Three LOW partial gaps were appended and done:

- **T057** (US1/AC3): `ImageCard` kept its load error when the photo changed, so a replaced photo could stay "Image unavailable" in the editor preview. It is now keyed by `publicId` (`CardBody.test.tsx` covers it).
- **T058** (FR-008, US1/AC1): the image e2e happy path now checks the photo in the editor preview before saving, not only in the list. `editor.spec.ts` 15 / 15 passed again locally.
- **T059** (plan structure): the `use-image-upload.ts` deviation (no TanStack mutation) is recorded above.
