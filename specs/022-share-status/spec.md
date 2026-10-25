# Feature Specification: Share status and auto-publish for publishers

**Feature Branch**: `022-share-status`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "Make shares (Android share target, iPhone Shortcut, paste box, email-in) traceable and let publishers skip review for their own shares. Problem observed in production: an image share was accepted ('Sent — it'll appear in Review'), the worker then failed the share (the reason was stored but neither logged nor shown), and the review entry is hidden while the queue is empty, so the sharer found nothing anywhere and had no way to learn what happened. Scope: (1) the sharer can see their recent shares with live status: processing, failed (with a readable reason and a way to try again or paste again), waiting for review (link to it), published (link to the card); (2) publishers always have a visible way into the review queue, even when it is empty; (3) the worker logs why a share failed (no secrets, no shared content); (4) a per-deck setting, changed by owners, 'publish my shares directly': a share from a member who can publish is published without review; it still needs at least one category and falls back to review if it has none or looks like a duplicate; default off; non-publishers' shares still always go to review. Bulk imports are out of scope."

Roadmap: follow-up to Phase 5 ingestion (D92–D111, `docs/design/ingestion.md`) after the first real shares on the deployed app. Builds on [`019-deck-admin`](../019-deck-admin/spec.md) (deck settings screen) and [`020-item-events`](../020-item-events/spec.md) (card events).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find out what happened to a share (Priority: P1)

A member shares a photo from their phone's gallery to Gobbit. The app says it was sent. A minute later they open the deck and don't see a new card. They open "Your shares" from the deck and see the photo's share at the top: "Couldn't read this share — the assistant's answer was unusable. Try again". They tap "Try again"; the row changes to "Processing…" and then to "Waiting for review", with a link to the proposal.

**Why this priority**: this is the production problem. Today a share that fails disappears without a trace, and the person who shared it can't tell whether it failed, is still running or is waiting somewhere they can't see.

**Independent Test**: submit a share that the worker fails; the sharer's "Your shares" list shows it as failed with a readable reason; "Try again" requeues it.

**Acceptance Scenarios**:

1. **Given** a member who just sent a share, **When** the "Sent" screen appears, **Then** it shows the share's live status (processing, then the outcome) and a link to "Your shares", instead of promising it will appear in review.
2. **Given** a share that is still being processed, **When** the sharer views "Your shares", **Then** it shows as "Processing" and updates by itself when it finishes, without a manual refresh.
3. **Given** a share that failed, **When** the sharer views it, **Then** they see a plain-language reason (for example "The page couldn't be fetched", "The assistant's answer was unusable", "You're no longer a member of this deck") and never a raw internal code or error text.
4. **Given** a failed share whose original content is still kept, **When** the sharer taps "Try again", **Then** the same share is processed again and its status goes back to "Processing".
5. **Given** a failed share whose original content is no longer kept, **When** the sharer views it, **Then** "Try again" is not offered and "Paste it again" opens the paste box for the deck.
6. **Given** a share waiting for review, **When** the sharer views it, **Then** it links to the proposal (the sharer can already see their own proposals).
7. **Given** a share that became a card, **When** the sharer views it, **Then** it links to the card; if a publisher discarded it, it shows "Not added" with who decided and when.
8. **Given** a member viewing "Your shares", **When** the list loads, **Then** it shows only their own shares to this deck, newest first, from the last 30 days.

---

### User Story 2 - Always reach the review queue (Priority: P1)

The owner of a deck opens it and wants to check the review queue. The queue is empty, but the entry is still in the deck header, without a count. Opening it shows "Nothing to review" and links to "Your shares".

**Why this priority**: today the only way into review disappears when the queue is empty, which is exactly when a publisher goes looking for a share that didn't arrive.

**Independent Test**: as a publisher of a deck with an empty queue, the review entry is visible in the deck header and opens an empty review screen.

**Acceptance Scenarios**:

1. **Given** a publisher and an empty queue, **When** they open the deck, **Then** the review entry is shown without a count.
2. **Given** a publisher and a non-empty queue, **When** they open the deck, **Then** the review entry shows the count, as today.
3. **Given** a member who can't publish, **When** they open the deck, **Then** there is no review entry, but "Your shares" is reachable.
4. **Given** an empty review queue, **When** a publisher opens it, **Then** it says there is nothing to review and links to "Your shares".

---

### User Story 3 - Publish my own shares directly (Priority: P2)

The owner of a deck shares links and photos to it every day and is tired of approving their own shares. In the deck settings they turn on "Publish shares from publishers directly". From then on their shares, and those of the deck's other publishers, become cards straight away. A share that has no category, or that looks like a duplicate of an existing card, still lands in review with the reason shown.

**Why this priority**: removes friction for the people who already have the right to publish; the trust model for everyone else is unchanged. Less urgent than seeing what happened to a share.

**Independent Test**: with the setting on, a publisher's share becomes a published card; with it off, or for an editor's share, it becomes a proposal.

**Acceptance Scenarios**:

1. **Given** the setting on and a share from a member who can publish at the time it is processed, **When** the share is turned into a card with at least one category and no duplicate warning, **Then** the card is published, with the sharer recorded as the person who published it, and the share shows "Published".
2. **Given** the setting on and such a share with no category, **When** it is processed, **Then** it goes to review, and the review entry and "Your shares" both say why ("needs a category").
3. **Given** the setting on and such a share flagged as a possible duplicate or an update of an existing card, **When** it is processed, **Then** it goes to review with the duplicate warning, as today.
4. **Given** the setting on and a share from a member who can't publish (editor or reader), **When** it is processed, **Then** it goes to review, as today.
5. **Given** the setting on and a sharer whose publishing right was removed after sharing but before processing, **When** the share is processed, **Then** it goes to review.
6. **Given** the setting off (the default for shared and communal decks; the personal deck defaults to on), **When** any share is processed, **Then** it goes to review, as today.
7. **Given** an owner, **When** they open deck settings, **Then** they can turn the setting on or off; a maintainer sees its state but can't change it; editors and readers don't see deck settings.
8. **Given** a card published directly from a share, **When** anyone looks at the deck's activity, **Then** it is recorded as published from a share by that member, the same as a share published from review.

---

### User Story 4 - Operators can see why shares fail (Priority: P2)

The person running the deployment reads the logs after a member reports a missing share and sees one line per failed share with its id, deck, channel and the failure reason, without the shared content or any credentials.

**Why this priority**: the production failure was only diagnosable by reading the database; one log line per failure closes that gap. Small.

**Independent Test**: fail a share; one error-level log line appears with the reason code and share id and none of the shared text, link or image data.

**Acceptance Scenarios**:

1. **Given** a share that fails for good, **When** the worker gives up, **Then** it writes one error log line with the share id, deck id, channel, attempt count and reason.
2. **Given** a share that fails but will be retried, **When** the attempt ends, **Then** a warning line notes the retry, as today.
3. **Given** any of these lines, **When** read, **Then** it contains no shared text, link, image data, email content or credentials.

### Edge Cases

- A share is retried while a previous attempt is still running: "Try again" is offered only for failed shares, and a second tap while it is processing does nothing.
- The member taps "Try again" many times on a share that keeps failing: retries count towards the same daily share limit as new shares.
- The member leaves the deck: their shares to it are no longer listed for them (they can't see the deck).
- A share made by a member who later becomes a publisher: the setting applies by role at processing time, not at sharing time.
- The setting is turned off while shares are still processing: shares processed after the change go to review.
- The personal deck: its owner is its only member and always a publisher, so the setting is on by default there (FR-014); existing personal decks get it turned on too.
- Email-in shares: listed like any other share; "Paste it again" for an email that is no longer kept says to forward it again.
- Offline: "Your shares" shows the last loaded list read-only with "you're offline"; "Try again" is disabled.
- The deck has no AI provider configured: shares are not accepted today, so there is nothing to list; the screen says sharing is off for this deck.
- A share whose card was later deleted: it links to the card's deleted state while it can still be restored, otherwise shows "Card deleted".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Members MUST be able to list their own shares to a deck from the last 30 days, newest first, each with its channel, a short preview (title, link host or "Photo"), time, and status.
- **FR-002**: Share status MUST be one of: processing (queued or running), failed, waiting for review, published, not added (discarded). The list and the "Sent" screen MUST update without a manual refresh while any listed share is processing.
- **FR-003**: Failed shares MUST show a plain-language reason mapped from the stored reason; unknown reasons MUST show a generic "Something went wrong" message. Raw codes and error text MUST NOT be shown.
- **FR-004**: The sharer MUST be able to try a failed share again while its original content is kept; trying again MUST requeue the same share, reset it to processing and count against the sharer's daily share limit. Other members MUST NOT be able to retry someone else's share.
- **FR-005**: When a failed share's content is no longer kept, the screen MUST offer "Paste it again" (opening the deck's paste box) instead of "Try again".
- **FR-006**: The "Sent" screen MUST stop promising the share will appear in review; it MUST show the share's live status and link to "Your shares".
- **FR-007**: Members who can publish MUST always see the review entry in the deck header; the count is shown only when greater than zero. The empty review screen MUST link to "Your shares".
- **FR-008**: Every member who can share to the deck MUST be able to reach "Your shares" from the deck, whatever their role (readers can't share, so they don't see it).
- **FR-009**: When a share fails for good, the system MUST write one error-level log line with the share id, deck id, channel, attempt count and reason code; logs MUST NOT include shared text, links, image data, email content or credentials.
- **FR-010**: Decks MUST have a setting "Publish shares from publishers directly", off by default for shared and communal decks (on for the personal deck, FR-014); only owners (including co-owners) can change it, and maintainers can see it.
- **FR-011**: With the setting on, a share MUST be published directly only if, at processing time, the sharer can publish on the deck, the card has at least one category, and the duplicate check found no likely duplicate or update; otherwise it MUST go to review with the reason shown in review and in "Your shares".
- **FR-012**: A directly published share MUST be recorded exactly as if the sharer had published it from review (published by the sharer, activity entry, search indexing, link snapshot), so nothing downstream can tell the two apart except the "published directly" mark on the share.
- **FR-013**: Shares from members who can't publish MUST always go to review regardless of the setting.
- **FR-014**: The personal deck MUST have the setting on by default (its only member is its owner, always a publisher); its owner can turn it off. The no-category and duplicate fallbacks (FR-011) still apply.
- **FR-015**: Proposals made directly by AI apps (MCP) and bulk imports MUST NOT be affected by the setting; they always go to review.
- **FR-016**: The share list MUST be readable offline from the last loaded copy; actions MUST be disabled offline.

### Key Entities

- **Share** (existing ingest job): who shared, deck, channel, when, status, failure reason, whether its original content is still kept, the resulting card, who reviewed it and when, and whether it was published directly.
- **Deck setting** (new): "publish shares from publishers directly" (on/off), per deck.
- **Failure reason** (existing codes): a fixed list of reason codes, each with a plain-language message.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can find out what happened to any share they made in the last 30 days in under 10 seconds from opening the deck.
- **SC-002**: 100% of failed shares show a plain-language reason to their sharer, and none shows a raw code or error text.
- **SC-003**: 100% of shares that fail for good produce exactly one error log line with the reason, and none of those lines contains shared content.
- **SC-004**: With the setting on, a publisher's share that meets the conditions appears as a published card without any review action, in the same time a proposal takes to appear today.
- **SC-005**: With the setting on or off, 0 shares from non-publishers, MCP proposals or imports are published without review.
- **SC-006**: A publisher can open the review queue from the deck header in one tap, whether or not it has items.

## Assumptions

- "Shares" means the share target, Shortcut, paste box and email-in channels; MCP proposals and bulk imports keep their own flows and are not listed.
- The 30-day window matches how long a share's original content is kept today; older shares are not listed.
- "Try again" reprocesses the stored original (link, text, uploaded photos); it doesn't re-upload anything from the phone.
- Daily share limits that apply today also apply to retries.
- Owners (including co-owners) decide the setting, mirroring who controls the deck's public switch; maintainers can publish but not change how publishing works for the whole deck.
- **Constitution dependency**: principle IV currently says "no automated path publishes a card [D96]". This feature needs a versioned amendment, recorded in the plan, saying: a card from a share may be published without review only when the deck's owners opted in and the sharer can publish; the AI still never publishes on behalf of anyone who couldn't publish it themselves.
- The production failure that prompted this (an image share failing after upload) gets its own regression test at the tier that would have caught it; the failure cause itself is diagnosed separately using the new log line.

## Clarifications

### Session 2026-10-25

- Q: Should the personal deck publish its owner's shares directly by default? → A: Yes, on by default (existing personal decks included), with the same no-category and duplicate fallbacks; the owner can turn it off.
