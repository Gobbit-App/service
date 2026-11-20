# Feature Specification: Model spend guard — smart share only for people switched on

**Feature Branch**: `050-model-spend-guard`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "Model extraction on ingestion (share target, paste box, email-in, iPhone Shortcut) is off by default for every user, switched on per person by hand in the database (no screen); without it nothing reaches the extraction model: the share is still saved as a proposal best effort, the person sees "smart share is coming soon" in the web share status, and the skipped extraction is a decision event. With it on, today's extraction and caps apply. Search, query embeddings, item embeddings and bulk import unchanged; Ask stays off. Best effort per share kind must be specified (link, text, image, email, files). Open decision: whether the draft embedding used for duplicate detection counts as model use for users without the switch."

Roadmap: the first communal deck launch, stage 3 (alpha), "getting in": [`community-go-list.md`](../../community-go-list.md) H11 (closes G21), rule in `PLAN.md` Phase 16. Builds on [`022-share-status`](../022-share-status/spec.md) (Your shares and the share states), [`045-media-cards`](../045-media-cards/spec.md) (files and photos proposed as media cards, no model for files) and the page-preview fallback (D355), which already saves a link share as a card when extraction fails.

## Background

Every share today (Android share target, paste box, email-in, iPhone Shortcut) goes to an extraction model, which writes the card: type, title, body, categories, event details. Each share costs a model call, and two calls when the first answer is escalated. The only limits are the daily caps per person (50 a channel, 200 in total). Once readers and waitlist cohorts arrive in stage 3, anyone who can add to a deck can run up model spend, including in their own personal deck.

The rule from the launch checklist: anonymous visitors and readers cannot run up model spend. For sharing, that means smart share (model extraction) is off for everyone by default. An operator switches it on for a person by hand. Without the switch, a share is still saved, as a plain proposal built from what the person sent and what the page itself says.

Pieces already in place:

- Files (PDF, audio, video) are proposed without a model (D395).
- A link share whose model answer is unusable becomes a link card from the page preview (D355).
- Text-only, photo-only and email-without-link shares have no model-free path today.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A share without smart share is still saved (Priority: P1)

A member without the switch shares a news article from their phone into a shared deck. No model sees it. A proposal appears in the review queue: a link card titled from the page's own title, with the page's description as its body and the page's preview image, marked "saved without smart share". The same goes for a pasted paragraph of text, a shared photo and a forwarded email: each becomes a proposal built only from what was sent.

**Why this priority**: this is the spend guard itself. Without it, model use is open to everyone who can add to a deck.

**Independent Test**: share a link, a text, a photo and an email as a user without the switch. Each gives one proposal shaped as described under Requirements (best effort per kind). No extraction call is recorded for any of them, and each has a decision event for the skipped extraction.

**Acceptance Scenarios**:

1. **Given** a user without the switch, **When** they share a web address, **Then** a link card is proposed with the page's title (or the share's title, or the site's name), the page's preview, and as body the text they wrote with it (or the page's description when they wrote none); no extraction call is made.
2. **Given** a user without the switch, **When** they share or paste text with no web address, **Then** a text card is proposed: the share's title (an email's subject) or else the text's first line is the title, and the rest of the text is the body.
3. **Given** a user without the switch, **When** they share one or more photos, **Then** a media card holding all the photos is proposed, titled from the share's title or text when there is one, else "Shared image", with any remaining text as its caption.
4. **Given** a user without the switch, **When** they send an email to their deck address, **Then** the subject is the title; photo attachments make a media card; otherwise a body that is only a web address makes a link card, and any other body makes a text card with the body as written (web addresses in it stay as text).
5. **Given** a user without the switch, **When** they share a PDF, audio or video file, **Then** it is proposed exactly as today; nothing changes for files.
6. **Given** any best-effort proposal, **When** it reaches the review queue, **Then** it is never published automatically, carries no categories (the deck's default holds it) and is marked as saved without smart share.
7. **Given** a best-effort share, **When** it is processed, **Then** a decision event records that extraction was skipped, why (switch off) and which card kind the best effort produced.

---

### User Story 2 - The sharer sees why the card is plain (Priority: P1)

The member opens Your shares (or sees the screen right after sharing from the app). Next to the share it says the card was saved as sent and that smart share is coming soon. They know nothing broke, and that the plain card is expected.

**Why this priority**: without the notice, plain cards look like a bug, and people stop sharing or report errors.

**Independent Test**: share as a user without the switch; the share's status in the app carries the "smart share is coming soon" notice. Share as a user with the switch; there is no notice.

**Acceptance Scenarios**:

1. **Given** a share processed without smart share, **When** the sharer views it in Your shares or on the after-share screen, **Then** they see that it was saved as sent and that smart share is coming soon.
2. **Given** a share processed with smart share, or a file share, **When** viewed, **Then** no such notice shows.
3. **Given** a share sent by the iPhone Shortcut or email, **When** it is processed, **Then** the Shortcut's confirmation and the email silence are unchanged; the notice shows in Your shares the next time the person opens the app.

---

### User Story 3 - People switched on keep today's smart share (Priority: P1)

An operator switches smart share on for a curator by a hand change in the database. The curator's shares, on every deck they can add to, are extracted as today, with today's daily caps. Platform admins have smart share without anyone switching it on.

**Why this priority**: curators seeding and maintaining the communal deck rely on extraction; the guard must not take it from them.

**Independent Test**: run the same share as one user without the switch and one with it; the first gives a best-effort proposal, the second an extracted one with an extraction call recorded.

**Acceptance Scenarios**:

1. **Given** a user with the switch on, **When** they share anything, **Then** it is extracted exactly as today, including escalation, event proposals and the preview fallback on failure.
2. **Given** a user whose switch is turned on or off, **When** their next share is processed, **Then** it follows the new setting; shares already processed are not redone.
3. **Given** a platform admin with no switch set, **When** they share, **Then** it is extracted.
4. **Given** any user, switch or not, **When** they share, **Then** today's daily caps per channel and in total apply.

---

### Edge Cases

- **A link whose page cannot be read** (blocked, timed out, no preview details): the link card has the site's name as its title and no body; the share is still saved.
- **Locked sites** (pages that block reading, D347/D348): the best-effort link card follows the same rules for those sites as the preview fallback does today.
- **Text longer than a card body**: the body keeps the text up to the body limit and is marked as cut in the review queue. The sharer edits it in review, since a proposal is never published as is.
- **A title longer than the title limit**: it is cut at the limit, as the first line of a media share is today.
- **A share with both a web address and photos** (app, paste, Shortcut): the web address wins (link card), as in extraction's own fallback; the photos are not used, the skip event records how many, and they are cleared like any unused upload.
- **An email with a web address in its text** (a signature, a footer, a forwarded link among other text): a text card, not a link card; only an email whose body is just the address becomes a link card.
- **An event page**: without the switch no event card is proposed. It becomes a link card; the curator can turn it into an event in the editor.
- **A share that cannot become any card** (for example a locked site rejects it and there is no text): the share ends as failed with the existing "couldn't be saved" reason. The decision event still records the skip.
- **The switch is changed while a share is waiting**: the setting at processing time decides.
- **A user removed from the deck before processing**: unchanged; the share fails as today.
- **The deployment has no model provider at all**: unchanged; sharing stays unavailable, as today. Model-free sharing without any provider is out of scope.

## Requirements *(mandatory)*

### Functional Requirements

**The switch**

- **FR-001**: Each user MUST have a smart-share setting, off by default for every existing and new user. It belongs to the person and applies on every deck they can add to.
- **FR-002**: The setting MUST be changeable only by an operator through the database; no screen, API route or self-service changes it.
- **FR-003**: Platform admins MUST be treated as switched on whatever their stored setting.

**Without the switch**

- **FR-004**: For a user without the switch, a share on any sharing channel (app share target, paste box, email-in, iPhone Shortcut) MUST NOT be sent to an extraction model.
- **FR-005**: It MUST still be saved as one proposal, built only from what was sent and what the shared page itself states. Best effort per kind:

  | Share contains | Card proposed | Title | Body / caption |
  |---|---|---|---|
  | A PDF, audio or video file | Media card, as today (D395) | as today | as today |
  | A web address, from the app, paste box or Shortcut (with or without text or photos) | Link card with the page's preview | page title, else share title, else the site's name | the sender's text without the address, else the page description, else none |
  | Photos, no web address | Media card holding all the photos | share title, else first line of text, else "Shared image" | rest of the text, if any, cut at the body limit |
  | Text only | Text card | share title, else the text's first line | the rest of the text, cut at the body limit |
  | Email with photo attachments | Media card holding the photos | subject, else first line, else "Shared image" | the body, cut at the body limit |
  | Email whose body is only a web address | Link card, as the web-address row | page title, else subject, else the site's name | page description, else none |
  | Any other email | Text card | subject, else first line | the body as written, cut at the body limit |

- **FR-006**: A best-effort proposal MUST have no categories, MUST never be published automatically and MUST be marked in the review queue as saved without smart share (and as cut, when its body was cut).
- **FR-007**: Best-effort proposals MUST go through the same validation, locked-site rules and duplicate check as extracted proposals.
- **FR-008**: The sharer MUST see, on the share's status in the app (Your shares and the after-share screen), that the share was saved as sent and that smart share is coming soon. Shares that were extracted, and file shares, MUST NOT show it.

**With the switch**

- **FR-009**: For a user with the switch, sharing MUST behave exactly as today: extraction, escalation, event proposals, preview fallback and auto-publish rules.

**For everyone**

- **FR-010**: The daily share caps (per channel and combined) MUST apply to every user, switch or not.
- **FR-011**: Search, query embeddings, card embeddings (including the one made for duplicate checking), bulk import and Ask MUST be unchanged.
- **FR-012**: The setting MUST be read when the share is processed, not when it is sent.

### Accountability

Decisions about a person's content this feature makes, each recorded (constitution VIII):

| Decision | Recorded as |
|---|---|
| Extraction skipped for a share (switch off) | decision event with job id, user id, reason and the best-effort card kind (link, media, text), or that none could be built |
| Best-effort body cut at the limit | the same decision event carries a "cut" flag; no content is logged |
| Shared photos not used because the share had a web address | the skip event carries the count of unused photos; ids only |
| Share failed because no best-effort card could be built | the existing share failure (state and reason the sharer sees) plus the skip event |

### Key Entities

- **Smart-share setting**: a per-person on/off value, off by default, set by an operator; platform admins count as on.
- **Best-effort proposal**: a proposal built without a model, marked as such for the reviewer and the sharer.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For users without the switch, zero extraction calls are recorded across every sharing channel.
- **SC-002**: 100% of shares from users without the switch that today become a proposal still become a proposal, except shares a locked site's rules reject (no share lost to the guard otherwise).
- **SC-003**: Every share processed without smart share has exactly one decision event recording the skip.
- **SC-004**: Users with the switch see no change: the same share gives the same extracted card as before the feature.
- **SC-005**: A sharer without the switch can tell from the app, without asking anyone, that the plain card is expected (the notice is on every such share).

## Assumptions

- **The duplicate-check embedding stays**. The embedding made for a draft during the duplicate check is saved as the card's own embedding. The embedding sweep embeds every live card, proposals included, whatever happens in the duplicate check, and card embeddings stay open under H11. So it is not extra spend, and skipping it would only weaken duplicate detection. The checklist's Verify "no `llm_calls` row" therefore reads as "no extraction call". Recorded as a deviation in the go-list log.
- **Platform admins are on without a data change**. The list of platform admins lives in the deployment's configuration, which a database migration cannot read. So instead of a migration switching them on, platform admins always count as switched on (FR-003). Recorded as a deviation.
- **Anyone else is switched on by hand**, by an operator changing the setting in the database. The runbook step is part of the feature's docs.
- **The notice reaches Shortcut and email senders only in the app**. The Shortcut's fixed confirmation and email-in's no-reply rule (no mail back to the sender) stay as they are.
- **No event cards without the switch**. Building events from a page's structured data without a model is not part of this feature.
- **Reader suggestions** (H5, not yet built) will follow this setting when that feature is specified; nothing is built for them here. "Never reaches the model" there means extraction, as here; card embeddings follow H11's open rule.
- **No plans or pricing table**. Smart share may become a paid or limited feature later, so the setting is a single on/off, not a plan.
