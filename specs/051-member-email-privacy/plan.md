# Implementation Plan: Member email privacy — no addresses in member data

**Branch**: `051-member-email-privacy` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 16 (`community-go-list.md` H6, closes G17)

**Input**: Feature specification from `/specs/051-member-email-privacy/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

Two builders change, one flag is added, and the members service decides per viewer.

- **Names** (D459): `displayNameSql` and `displayNameOf`, the only two name builders (D419), become profile name, else username, else `"Member"`. That one change reaches the members list, the role-change and invite answers, the activity log, the review queue, share rows and the invite mail. `users.display_name` (the email-derived name) leaves every shown name.
- **Initials** (D460): `initialsFor`'s fallback becomes an explicit string: the username for others, the own email for self views. A floor name gets the glyph.
- **The address** (D461): `memberships.invited_by_email` records whether the current invite was typed as an address. A member row carries an address only when it is pending, typed, and the viewer is the one who sent the current invite. The viewer's own row carries none.
- **No oracle** (D462): a pending typed-address row shows no profile (name "Member", no username, no photo) to anyone, so typing an address never reveals who owns it.
- **Invited by** (D463): pending rows carry `invitedBy` for viewers who may invite. A placeholder replaces an inviter who has left the deck.
- **Mail floor** (D464): "A Gobbit member invited you…" when the inviter has no name.
- **Web**: the member row's secondary line adds "Invited by …". Pickers and other screens already read the changed fields.

## Starting point

`origin/main @ 9f00f4b` (049 import v2, #182; this branch carries only the 051 spec docs on top of `ed84355`). Latest migration `0028_smart_share`, so this feature's migration is `0029_invited_by_email`. Builds on `046-user-profile`: names, usernames, avatars, summaries, lookup and invite by username (D417–D429, ADR-080, `docs/design/profile.md`). Next free ids: D459, ADR-084. Not deployed.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22; React 19

**Primary Dependencies**: existing only. No new dependency.

**Storage**: PostgreSQL 17. One column on `memberships` (migration `0029_invited_by_email` + hand-written down file). See [data-model.md](./data-model.md).

**Testing**: Vitest unit (name chain, initials, summaries, mail copy, member row line); integration (a new scan over every member-facing answer, as each role on each deck kind, plus updates to existing member, invite, events, shares and profile tests that assert email-derived names); Playwright `@full`.

**E2E tier**: full. The privacy rules are API answers, covered at the integration tier by the SC-001 scan. The UI change is one secondary line on the deck-settings member row, a variant view. The smoke journeys in `smoke/members.spec.ts` keep passing unchanged: invite by email answers the typed address to the inviter, and invite by username shows no address on screen. One `@full` case adds the multi-person screen view: a reader sees no address, and the inviter sees their typed one (D465).

**UI reference**:
- "Invited by …" → the existing `span.muted` secondary line in `admin-member__who` (`apps/web/src/deck-admin/MembersSection.tsx`), which today shows the email or `@username`. Same element and class, no new class or token.
- The anonymous pending row and the floor name reuse the existing `Avatar` glyph and the row as it is.

**Target Platform**: Docker Compose on Dokploy; PWA

**Project Type**: pnpm monorepo — API + worker, PWA, shared packages

**Performance Goals**: N/A. The member list does the same queries. The summary query drops a column.

**Constraints**: web bundle ≤ 150 KB gzip (unchanged: no new import); same origin; no env var.

**Scale/Scope**: every deck's members list. Decks hold a handful to a few hundred members.

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | Masking, anonymity and `invitedBy` are rules in `memberships.service` (using `can(role, 'member.invite')` from the role `authorize()` returns). The flag is written in `memberships.repo`. Names are SQL in `@gobbit/db` (`displayNameSql`). No route changes. |
| II. One source of truth for contracts | `memberSchema.invitedBy` and `MEMBER_NAME` live in `@gobbit/shared`; `pnpm api:openapi` regenerates the client. |
| III. Invariants live in the database | The flag is `NOT NULL DEFAULT false`; the shown name is built in SQL by the one builder. Down file written by hand. Who may see an address depends on the viewer, so it is a service rule, not a DB rule. |
| IV. Private by default | This feature *is* the principle: addresses leave every member answer except the inviter's own pending typed invite. A typed address never reveals a profile (D462). Lookup's deck-mate rule and rate limit are untouched. No address or name in logs. |
| V. Tests at the right tier | Unit + integration scan + one `@full` case; traceability table below; E2E tier stated above. |
| VI. Lean, offline-first web | One line of copy in an existing component, no new query or import. The persisted members query is replaced by its next refresh; no cache bump that would drop offline cards (D465). |
| VII. Simple, optional, deployable | One additive column, no env var, no dependency. |
| VIII. Accountable by default | No new decision about a person (spec, Accountability); table below says why. Lookup keeps 046's events. |
| IX. Reuse before writing | Checked: the two existing name builders (changed, not duplicated), `initialsFor` (one parameter), `member-summaries` (unchanged shape), the `sharedBy` summary-plus-name pattern for `invitedBy`, the 046 creator placeholder, `can()`, the existing `invited_by` column, the existing secondary line in the member row. New code: the flag, the per-viewer rule, one template ternary. |
| X. One UI system | UI reference above; no new class, token or layout. The UI task takes phone 412 px + desktop 1280 px screenshots, light + dark, of the members list as owner (pending typed and username rows) and as reader, compared with today's row. |

Re-check after design: no violation; nothing in Complexity Tracking.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D459 | The shown name is profile name, else username, else `"Member"`, built only by `displayNameSql`/`displayNameOf` (changed in place). `users.display_name` is no longer part of any name; D419's "revert to the old value" is superseded; the column stays (follow-up). `/me`'s `user.displayName` and the admin waitlist's inviter name follow too. | yes → ADR-084 |
| D460 | `initialsFor({ firstName, lastName, fallback })`: summaries pass the username, self views their own email; `"Member"` is never passed (glyph). `summariesByIds` stops selecting `email`. | no |
| D461 | `memberships.invited_by_email` (boolean). A row carries the address only when it is pending ∧ typed ∧ invited by the viewer. `reinvite` rewrites the flag. Pre-existing pending invites read false. | yes → ADR-084 |
| D462 | A pending typed-address row, and its invite answer, show no profile to anyone (name "Member", no username, initials, photo). Username invites keep today's summary. | yes → ADR-084 |
| D463 | `Member.invitedBy` (summary + shown name) on pending rows for viewers with `member.invite`. Placeholder when the inviter is not on the deck or deleted. A demoted inviter still sees the address, not "invited by". | no |
| D464 | Invite mail: "A Gobbit member invited you…" when the inviter's name is `"Member"`. | no |
| D465 | No persisted-cache bump: the next refresh replaces offline member data (FR-011). E2E tier full. | no |

## Project Structure

### Documentation (this feature)

```text
specs/051-member-email-privacy/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── members.md       # Member/Membership fields, other named answers, mail
├── checklists/requirements.md
├── tasks.md             # /speckit-tasks (not created here)
└── implementation-notes.md
```

### Source Code (repository root)

```text
packages/db/
├── src/schema/users.ts                        # displayNameSql: + username, "Member"
├── src/schema/memberships.ts                  # + invitedByEmail
└── migrations/0029_invited_by_email.sql (+ down/0029_invited_by_email.down.sql)

packages/shared/src/
├── schemas/profile.ts (+ .test.ts)            # displayNameOf chain, MEMBER_NAME
├── schemas/membership.ts                      # memberSchema.invitedBy
└── avatar/index.ts (+ .test.ts)               # initialsFor fallback

apps/api/src/
├── repositories/memberships.repo.ts           # create/reinvite write invitedByEmail
├── repositories/users.repo.ts                 # summariesByIds: + username already, − email
├── services/member-summaries.ts (+ test)      # initials from username
├── services/memberships.service.ts (+ test)   # per-viewer email, anonymous pending, invitedBy
├── services/profile.service.ts                # initialsFor(fallback: own email)
└── mail/templates.ts (+ test)                 # floor copy
apps/api/test/
├── member-email-privacy.int.test.ts           # NEW: SC-001 scan per role × deck kind
└── {memberships,invites,member-role,item-events,shares,profile}.int.test.ts  # updated expectations

apps/web/src/
├── deck-admin/MembersSection.tsx (+ test)     # "Invited by …" line
├── app/BottomBar.tsx, profile/ProfileForm.tsx # initialsFor argument rename (self, own email)

e2e/tests/full/member-privacy.spec.ts          # NEW @full
docs/design/profile.md, docs/adr.md (ADR-084), docs/architecture.md (one index row), CLAUDE.md (Profile line), specs/README.md
```

**Structure Decision**: all changes sit where 046 put names, summaries and members. There is no new package, route, table or query.

## Invariant → test traceability

| Invariant / rule (spec FR or D-number) | Enforced in | Test (file, tier) |
|----------------------------------------|-------------|-------------------|
| FR-001, SC-001: no address in any member answer, any role, any deck kind | `memberships.service` (D461); summaries without email (D460) | `member-email-privacy.int.test.ts`: owner, co-owner, maintainer, editor, reader on shared and communal decks (owner only on personal) call members list, role change, invite, events, review queue, shares, item list; the JSON contains no member address except the allowed one, int |
| FR-002, D461: the inviter sees their typed address while pending | `memberships.service`, `invited_by_email` | same int file: inviter sees it; co-owner doesn't; gone after accept; re-invite by the co-owner moves it; re-invite by username clears it; a demoted inviter still sees it, int; `memberships.service.test.ts`, unit |
| FR-003: a username invite never shows the address | `invited_by_email = false`; invite answer | `invites.int.test.ts` (existing case kept) + scan, int |
| D462: a typed address reveals no profile | `memberships.service` | int: invite an existing user with a name, username and photo by address; the pending row and the invite answer show "Member", no username, no photo, to every viewer; after accept the profile shows, int |
| FR-004: own row has no address | `memberships.service` | scan includes each viewer's own row, int |
| FR-005, D463: invited by for owners, placeholder | `memberships.service` with `can()` | int: owner and co-owner get `invitedBy`; maintainer, editor and reader get null; inviter removed → placeholder, int |
| FR-006, D459: name chain everywhere | `displayNameSql`, `displayNameOf` | `profile.test.ts` (unit); `item-events.int.test.ts`, `shares.int.test.ts`, `memberships.int.test.ts` updated to expect "Member"/username, int; mail via `memberships.service.test.ts`, unit |
| FR-007, D460: initials from the shown name | `initialsFor`, `member-summaries` | `avatar/index.test.ts`, `member-summaries.test.ts`, unit; SC-002 case (`dana.levi@example.test`, no names: no "dana"/"levi"/"DL") in the int scan |
| FR-008: own view unchanged | self callers pass own email | `profile.int.test.ts` (`/me` profile initials unchanged), int |
| D464: mail floor copy | `inviteEmail` | `templates.test.ts`, unit |
| FR-009, FR-010, SC-004: lookup, permissions, flows unchanged | not touched | existing `profile.int.test.ts` lookup cases, `member-role.int.test.ts`, `smoke/members.spec.ts`, `full/deck-admin.spec.ts` pass |
| FR-011, D465: offline copy replaced | persisted query refetch | none new (existing persist behaviour; documented) |
| UI: secondary line | `MembersSection` | `MembersSection.test.tsx`, unit; `full/member-privacy.spec.ts`, e2e full |

## Accountability

| Decision | Event / audit row | Outcomes · reasons | Fields (ids/hashes only) | Level | Watched (instance / aggregate / rate) | Alert threshold (default) | Test |
|----------|-------------------|--------------------|--------------------------|-------|---------------------------------------|---------------------------|------|
| None new | — | — | — | — | — | — | — |

Why none: hiding addresses, the name chain and the anonymous pending row apply to everyone alike. They limit what answers contain, not what anyone may do. Who sees a typed address follows from who sent the invite, a fact already stored (`invited_by`). Lookups and username invites keep 046's `profile.lookup` events and enumeration alert (D424). Invites still record no decision event. That gap predates this feature and belongs to H7 (spec, Accountability).

**Operator controls**: none new. `PROFILE_LOOKUP_RATE_PER_HOUR` is unchanged.

## Rollout

- **Migrations**: `0029_invited_by_email`: additive, `ADD COLUMN … NOT NULL DEFAULT false`, reversible (down file drops it). No backfill. Pending invites already sent read as untyped, so their inviters see no address until they re-invite (D461).
- **Env / config**: none. No `CHANGELOG.md` entry needed (no env var); the PR states the visible change: members without a name now show as their username or "Member".
- **API client**: `pnpm api:openapi`, yes (`Member.invitedBy`).
- **Deploy order / flags**: normal CI → Dokploy flow.
- **Docs**:
  - `docs/design/profile.md`: D419/D420 paragraphs and a Deviations entry.
  - `docs/adr.md`: ADR-084.
  - `docs/architecture.md`: one index row.
  - `CLAUDE.md`: the Profile ground rule says member answers carry no address except the inviter's pending typed invite.
  - `specs/README.md`: D459–D465 and ADR-084.
  - `community-go-list.md` Tracking: plan line now, tick on merge.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| A member's own avatar differs between the bottom bar (own-email initials) and the members list and cards (glyph or username initials) | H / L | Chosen by the spec (FR-008 vs FR-007); the profile-completion call to action (`PLAN.md` Phase 16 item 6) is what fixes it, by getting a name set. |
| Many people show as "Member" in alpha, hard to tell apart | M / M | Avatar colour per person, username, role and date (spec Edge cases); H13 nudges names. |
| A member answer added later puts `users.email` back | M / H | The int scan covers every answer listed in the contract; `memberSummarySchema` has no email; the CLAUDE.md Profile rule names it. |
| Existing tests assert email-derived names | H / L | Listed in Project Structure; updated in the same tasks as the builders. |
| `users.display_name` lingers as an unused, email-derived column | H / L | Recorded in D459 and the design doc as a follow-up; nothing reads it. |

## Settle before starting

- [ ] None outside the repo. Rebase on `origin/main` (one commit ahead, #182) before implementing.

## Complexity Tracking

No violations.

## Pruned from the plan (constitution IX)

| Removed | Why |
|---------|-----|
| A second name builder for "other people's views" | The two existing builders change in place. `/me`'s unused `displayName` is the only self-facing consequence (D459). |
| Dropping `users.display_name` | Not needed for privacy once nothing reads it; it touches registration and the seed. Left as a follow-up. |
| Storing the typed address on the membership | `users.email` already holds it. A boolean is enough (D461). |
| A persisted-cache version bump | It would drop every offline card to clear what the next refresh clears (D465). |
| A pending-invites endpoint or screen | The members list already shows pending rows; one field and one line suffice (D463). |
| Rate limits or decision events on email invites | D462 removes the oracle instead. The spec adds no events. |
| A smoke e2e test | The critical invite journey is unchanged and already in smoke (D465). |
| Client-side masking or name building | The server decides; the web renders the fields it gets. |
