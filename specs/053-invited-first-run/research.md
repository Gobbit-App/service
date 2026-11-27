# Research: First run for invited people

Decisions D478–D486 (reserved in `specs/README.md`). The durable ones become ADR-086.

## D478 — "Welcome dismissed" is a column on the membership, backfilled for existing members

- **Decision**: `memberships.welcome_dismissed_at` (timestamptz(3), nullable). The migration sets it to `accepted_at` on every accepted row (`accepted_at IS NOT NULL`), whether active or removed. Pending rows stay null, so an invite still waiting at release gets the welcome when it is accepted.
- **Rationale**:
  - The clarification (2026-11-25) makes "once" per person per membership on every device, so the fact must live on the server. The membership is the thing it belongs to (spec Key Entities).
  - A new membership starts null, so "removed and invited again" gets a fresh welcome (spec edge case). Every insert is a new row: `memberships.create` always inserts, link acceptance inserts or updates a _pending_ row, and removal soft-deletes. Nothing revives a removed row.
  - The backfill is the whole of FR-003's "accepted before this feature shipped". No release date is stored or compared at runtime.
  - Deck creators and owning-account users have no membership row: `resolveRole` gives them `owner` through `decks.owner_account_id`. The personal deck is never shared, so it has no invited membership either. Both are therefore excluded by construction (FR-003).
- **Alternatives considered**:
  - **A `user_ui_flags` table or a JSON column on `users`.** This is more general, but nothing else needs it today (constitution IX), and it would need its own reset rule for re-invites.
  - **Comparing `accepted_at` with a release constant.** This needs a deploy-time value, and it can't say "dismissed".
  - **localStorage only** (as the "How to browse" sheet does). This was ruled out by the clarification.

## D479 — The welcome rides on the single-deck read

- **Decision**: `GET /decks/{id}` answers `deckDetailSchema`. This is `deckSchema` plus `welcome: { membershipId, inviter } | null`, where `inviter` is a `MemberSummary` or null. `welcome` is non-null only when all of these hold:
  - the caller is not on the deck's owning account;
  - the caller has an active membership with `accepted_at` set;
  - `welcome_dismissed_at` is null.

  The deck list, create and update answers keep `deckSchema` unchanged, so the list pays for no inviter lookups.

- **Rationale**:
  - The deck page already loads this query, and the persisted query cache keeps it offline. The welcome therefore needs nothing the deck view doesn't already have (spec edge case "Offline").
  - `authorize()` returns only the role, so `decks.service.get` reads the membership with `memberships.findActive` (one indexed lookup). It skips the read when the caller is on the owning account, as `invite-links.repo` does.
  - The inviter goes through `member-summaries.summaries([invitedBy])`. That gives profile name, else username, with no email read (FR-005, 051). A deleted inviter is absent from the map, so `inviter: null` and the inviter line is left out (spec edge case). An inviter who has since left the deck is still named, because the lookup is by user and not by membership.
- **Alternatives considered**:
  - **A separate `GET /decks/{id}/welcome`.** That is one more request on every deck open, and one more offline cache entry.
  - **A field on `deckSchema` everywhere.** Then the list, create and update would also have to fill it.

## D480 — Dismissal is `DELETE /decks/{id}/welcome`, idempotent

- **Decision**: `DELETE /decks/{id}/welcome` → 204. The service:
  1. resolves the deck and authorizes `deck.read` (a deck the caller can't see answers 404, as everywhere);
  2. sets `welcome_dismissed_at = now` on the caller's active membership where it is null.

  It answers 204 whether or not a row changed. The repository returns the outcome, and the service logs it (Accountability).

- **Rationale**: dismissing is the person's own one-way action, so DELETE on "my welcome on this deck" reads naturally. It is safe to retry, which the offline retry (D481) relies on.
- **Alternatives considered**:
  - **`PATCH /decks/{id}/membership` with a flag.** That opens a general "update my membership" surface that nothing else needs.
  - **`PUT /me/…` keyed by deck.** It would split deck state across two route families.

## D481 — Offline dismissal: hide at once, remember locally by membership id, retry until the server has it

- **Decision**: on dismissal the web does three things:
  1. writes the membership id to a local pending set (`gobbit:welcome-dismissed:v1`, via `defaultStore()` from `lib/last-deck`, as `hint-store` does);
  2. sets `welcome: null` in the cached deck query, so the persisted cache doesn't show it again;
  3. sends the DELETE.

  The welcome shows only when `deck.welcome` is set and its `membershipId` is not in the pending set. While an id is pending, the deck screen re-sends the DELETE when it mounts and when the browser goes `online`. The id is removed on a 204 or a 404.

- **Rationale**:
  - FR-011: closing offline must hold and reach the server later. The persisted query cache stores no mutations, so a paused TanStack mutation is lost on app restart. A key in localStorage is not.
  - Keying by membership id, not deck, means a later re-invite (a new membership) or another person on the same device is never suppressed. It also never dismisses their welcome on the server.
- **Alternatives considered**:
  - **Persisting paused mutations** (`shouldDehydrateMutation` plus `resumePausedMutations`). This changes app-wide persistence for one boolean.
  - **Local only, no retry.** Then another device would show the welcome again after an offline close, against FR-002.

## D482 — The inviter is `memberships.invited_by`; accepting a link over a pending invite names the link's creator

- **Decision**: the welcome names `memberships.invited_by`. When a link invite is accepted by someone who already has a _pending_ typed invite to the deck, `invite-links.repo` now also sets `invited_by = link.created_by` on that row. Today it sets only `role` and `accepted_at`.
- **Rationale**: spec Assumptions says "the inviter is whoever sent the invite that was accepted". In that case the accepted invite is the link. Mailed re-invites already replace the inviter (`memberships.reinvite`, D37). `invited_by_email` is left as is: it only matters while an invite is pending (051, D461), and the row is accepted in the same statement.
- **Alternatives considered**:
  - **Leaving it.** The welcome would name the person whose mailed invite was not the one used.

## D483 — The welcome is a `Sheet` mounted by the deck header on list views, after the consent wall

- **Decision**:
  - `deck-header/DeckWelcome.tsx` renders through `ui/sheet/Sheet` (the native modal, D304). `DeckHeader` mounts it on the deck's list views, where every invite path lands (`/d/<slug>`).
  - It shows only when all of these hold:
    - `deck.welcome` is set and not pending locally (D481);
    - `me` and `config` have loaded;
    - the analytics consent question is answered, or analytics is not configured.
  - The welcome does not reuse `ConsentPrompt`'s full condition. That condition also needs the device online and an allowed route, so an offline reopen would show the welcome and the wall would then open on top of it when the device came back online. The welcome waits while consent is unanswered with analytics configured (`config.analytics && me.analyticsConsent.value === 'unanswered'`), whether or not the device is online.
- **Rationale**:
  - FR-004: two native modals must never stack, and the consent wall comes first.
  - The prompt reads `me` from the cache only. Waiting for `me` and `config` stops the welcome from opening just before the wall appears.
  - Waiting on the answer rather than on the wall being open means the welcome never opens while the wall still can. The two conditions differ on purpose, so `ConsentPrompt` stays unchanged.
  - Mounting in `DeckHeader` puts the welcome next to the search sheet it opens (D484).
- **Alternatives considered**:
  - **A root-level overlay queue.** That is a new mechanism for two overlays (constitution IX).
  - **Mounting in the `/d/$slug/` route only.** The search entry point would then need a cross-component signal to open the header's sheet.

## D484 — Entry points: categories opens Browse with its list; search opens the header's search sheet

- **Decision**:
  - **Categories**: the welcome closes and makes two navigations, each a new history entry:
    1. to Browse the way the card list's Browse button does, with `fromListState(listC)`;
    2. to the same Browse location with `withLayer(state, 'categories')`, as Browse's own `onLayer` does.

    `d.$slug.browse.tsx` does not change.

  - **Search**: the welcome closes and calls the header's existing `setSearchOpen(true)`. `SearchSheet` focuses its box (D382).
  - **Start reading**: close only.
  - **Escape or tapping the backdrop**: these are the `Sheet`'s close and count as dismissal.
- **Rationale**:
  - The category layer must be its own history entry. `closeLayer` calls `history.back()`, so a layer opened in the same entry as Browse would leave Browse on the first pick (D332).
  - Both targets already exist; no new screen (spec Assumptions).
- **FR-008 ("no category the person can see")**: every deck has its protected default category, and Browse's cycle always adds "All". The categories entry point is therefore left out only when the deck's categories query returns no category for the person. In practice this is a guard rather than a common path. An unseeded alpha deck still shows the entry and lands on an empty "All".
- **Alternatives considered**:
  - **Opening the header's category switcher.** This was rejected in clarify (2026-11-25).
  - **A search-param flag (`?list=1`).** It would survive a reload and a shared link, and would reopen the list.
  - **A one-shot `openCategories` flag in the location state, read by `BrowseRoute` on mount.** Browse copies its state forward (`state: (prev) => prev` on card and category changes, `withLayer(prev, …)` for layers), and history state survives a reload. The flag would ride into later entries and reopen the list after a reload unless dropped with an extra replace.

## D485 — "How to browse" waits for any Browse layer to close

- **Decision**: `BrowseScreen` renders `FirstRunHint` only when `hint && layer === null`.
- **Rationale**: FR-004 and User Story 2 scenario 5 say the hint shows after a category is picked, never over the list. This is one condition and no new state.
- **Accepted consequence**: if the person closes the category list with Escape without picking, the hint shows then. It still comes after the list and never on top, so FR-004 holds. Today it can also no longer appear over the full view.

## D486 — E2E tier: smoke, by extending 052's join journey

- **Decision**:
  - **Smoke**: extend `e2e/tests/smoke/invite-link.spec.ts`. The guest who joins by link is a fresh account with the consent question unanswered, and the e2e stack sets `ANALYTICS_SITE_ID`. After landing on the deck, the test checks:
    - the consent wall shows first;
    - after answering it, the welcome names the deck and the inviter;
    - "Start reading" closes it;
    - after a reload, no welcome shows.
  - **Full**: one `@full` spec for a mailed invite:
    - the welcome shows;
    - Categories leads to Browse with the list open;
    - picking a category shows "How to browse" after the list;
    - Search opens the focused search box;
    - signing in again in a new browser context shows no welcome (another device).
  - **Component tests** cover the overlay order and the entry points.
  - **Fixture**: `createMember` (`e2e/fixtures/identity.ts`) gives invited members to `@full` specs such as `member-privacy` and `profile`. It already declines analytics through the API, and now also sends `DELETE /decks/{id}/welcome`, so those specs never meet the sheet.
- **Rationale**: accepting an invite and landing on the deck is a stage-3 critical journey (constitution V). The existing smoke journey already ends where the welcome appears, and a fresh joiner meets the consent wall, so the smoke test covers FR-004's order for real at almost no extra cost. The variants go nightly.
