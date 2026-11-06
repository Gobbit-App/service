# Feature Specification: Share visuals

**Feature Branch**: `041-share-visuals`

**Created**: 2026-11-06

**Status**: Draft

**Input**: User description: "Shares and link cards should carry the most visual content the source offers. (1) Identify honestly when fetching link previews and shared pages: use a self-identifying link-preview crawler identity instead of the browser-like one, because Instagram answers the browser-like identity with an empty app shell (no title, no image) and link-preview crawlers with the post's title, caption and cover image; revisit the locked-host handling (D167/D168) so a real (non-generic) preview from a locked host is used. (2) Host-specific public, key-free lookups (YouTube, TikTok, Vimeo) for a thumbnail and title when the page gives little; Instagram/Meta lookups that need an app token stay out. (3) Richer image choice for ordinary pages: fallbacks beyond the Open Graph image (secure OG image, Twitter card image, structured-data image, `image_src` link, the largest image in the article) plus a video's poster. All outbound through safe-fetch; images still copied into image storage by the link-snapshot job; no new card type; no third-party embeds (deferred). Evidence: an Instagram reel share produced a link card with no image and a made-up 'Instagram Reel by User' title."

Builds on [`014-link-snapshots`](../014-link-snapshots/spec.md) (stored preview images, the snapshot job) and [`015-locked-host-links`](../015-locked-host-links/spec.md) (locked social hosts, D166–D168). Deferred: playing the original post inside the card (third-party embeds), which needs its own privacy and consent decision.

## Background

Today a shared Instagram reel, which arrives as a bare URL (the app's share sheet sends no image), becomes a link card with no image. Its title is made up by the extractor ("Instagram Reel by User"), and its summary says the content is not available. The page fetch identifies itself like a desktop browser. Instagram answers that with an empty app shell, which 015 rightly discards as a login wall. The same URL requested by a self-identified link-preview crawler returned the post's real title, caption and cover image (checked by hand from a developer machine, not yet from the production host). Ordinary web pages lose images too: only the Open Graph image is read, so pages that publish their image another way show none. And a link card that has a title but no image is never looked at again.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A shared social post shows its picture and real title (Priority: P1)

A member shares an Instagram reel to the deck from their phone. The share holds only the link. The proposal is a link card that shows the post's cover image, the author's real post title and the caption, so the card looks like the post and the reviewer can tell what it is without opening Instagram.

**Why this priority**: this is the reported problem. Social shares are the most common way content enters a deck, and an imageless card with a made-up title is neither engaging nor trustworthy.

**Independent Test**: share a public Instagram post link (no caption, no image) to a deck; the proposal shows the post's image, a title taken from the post and the caption as its description.

**Acceptance Scenarios**:

1. **Given** a share of a public post on a locked host whose page gives a real preview to link-preview crawlers, **When** the proposal is created, **Then** it is a link card whose preview title, description and image come from that preview, and the image is copied into the deck's image storage.
2. **Given** the same share but the host answers with a login wall or an empty shell, **When** the proposal is created, **Then** the card behaves as today (015): the member's shared caption and image are used, and a generic page is discarded.
3. **Given** a share that includes both a member's image and a real preview image from the host, **When** the proposal is created, **Then** the member's shared image is the card's image (what the member chose wins), and the host's title and description fill what the share lacks.
4. **Given** the page preview supplies a real title, **When** the extractor writes the card, **Then** the card title is based on that title, not invented; with no real title and no caption the card says only what is known (host label and URL) rather than a made-up description.

---

### User Story 2 - Video links show a thumbnail (Priority: P2)

A member shares a TikTok or YouTube video. The card shows the video's thumbnail and title, even when the video page itself gives the server nothing useful.

**Why this priority**: video links are common shares and are the most visual content; without a thumbnail they look like plain text links.

**Independent Test**: share a public TikTok video link and a YouTube link; each proposal shows the video's thumbnail and title.

**Acceptance Scenarios**:

1. **Given** a link on a supported video host (YouTube, TikTok, Vimeo) whose page gives no usable image or title, **When** the preview is built, **Then** the host's public, key-free lookup supplies the thumbnail and title.
2. **Given** the page itself already gives a usable image and title, **When** the preview is built, **Then** the host lookup is not needed and is not made.
3. **Given** the host lookup fails, times out or answers with nothing usable, **When** the preview is built, **Then** the card falls back to what the page gave (or to today's behaviour), and the share is never failed because of it.
4. **Given** a host whose lookup needs an app key or account (Instagram, Facebook), **When** the preview is built, **Then** no such lookup is made.

---

### User Story 3 - Ordinary pages show their best picture (Priority: P2)

A member shares a recipe blog post or a news article. The page has no Open Graph image but does publish an image in another standard way (a Twitter card image, structured data, an `image_src` link) or has a clear lead image in the article. The card shows that image.

**Why this priority**: the same "no picture" problem on ordinary pages, and the fix also helps the editor's "Fetch preview" and hand-made link cards.

**Independent Test**: run preview building against saved test pages that each carry their image in one of the supported ways; each yields that image, and a page with several gives the preferred one.

**Acceptance Scenarios**:

1. **Given** a page with an Open Graph image, **When** the preview is built, **Then** that image is used (no change from today).
2. **Given** a page without one but with a secure Open Graph image, a Twitter card image, a structured-data image or an `image_src` link, **When** the preview is built, **Then** the first available in that order is used.
3. **Given** a page with none of these but an image inside the article's readable content that is large enough to be a picture (not an icon, logo, avatar, tracking pixel or spacer), **When** the preview is built, **Then** the largest such image is used.
4. **Given** a video page whose only image is the video's poster, **When** the preview is built, **Then** the poster is used.
5. **Given** a candidate image that can't be downloaded, isn't an image or is too small, **When** the snapshot job copies it, **Then** the card keeps no broken image and the next candidate is tried, up to a small fixed number of tries.

---

### User Story 4 - Existing imageless link cards get their picture (Priority: P3)

Cards created before this change, like the Instagram card in the report, have a title but no image. Each live link card without a preview image is looked at once more with the new rules, so it gains an image if one is now available.

**Why this priority**: improves cards already in decks, but new shares matter more.

**Independent Test**: create a live link card with a title and no image for a page that now yields one; after the one-time pass, the card shows the image; a second pass changes nothing.

**Acceptance Scenarios**:

1. **Given** a live link card with a title or description but no image, **When** it is looked at under the new rules, **Then** a found image is added without changing the card's title, description or body as edited by members.
2. **Given** a card whose image was added or removed by a member, **When** the pass runs, **Then** that choice is kept and no image is added.
3. **Given** a card already looked at under the new rules, **When** the pass runs again, **Then** the page is not requested again.

### Edge Cases

- A locked host answers the crawler identity with a real-looking but wrong page (a different post, a "content unavailable" page): a preview whose title or image is generic or matches a known unavailable page is discarded like a login wall.
- Private or deleted posts: the host gives nothing usable; the card follows 015 (caption and shared image, else URL and host label).
- The production host gets a login wall from a social host even with the crawler identity (rate limits or blocked server networks): behaviour is as today; the outcome is recorded so the success rate can be watched.
- A site that served the browser-like identity but refuses crawlers: the preview may be lost for that site. The change must not lower the share of ordinary test pages that get a preview, compared with today.
- Image URLs that are relative, protocol-relative, data URIs or non-http(s): relative and protocol-relative ones are resolved against the page; others are ignored.
- Several Open Graph images: the first usable one is taken.
- The member edits the card while the image is being looked up: the member's edit wins (as in 014).
- Shares made without image storage configured: previews may name a remote image, but nothing is copied (as in 014).
- Repeated shares of the same link in a short time: lookups to the same host stay within the existing fetch limits; a host lookup is never made more than once per share or card.

## Requirements *(mandatory)*

### Functional Requirements

**Identity**

- **FR-001**: Requests that read a page to build a link preview or a share's source (ingest, the snapshot job, the editor's "Fetch preview") MUST identify the app honestly as a link-preview crawler, with a name and a URL that explains it, and MUST NOT present themselves as a person's browser.
- **FR-002**: Image downloads and link checks MAY keep their current identity; the plan decides and records it.

**Locked hosts (revises 015)**

- **FR-003**: For a locked host, a page preview that is not generic (a real title, a description or an image) MUST be used to build the card, in the same way as for other hosts; generic and login-wall previews MUST still be discarded (015's rule).
- **FR-004**: When the member's share includes an image, it MUST stay the card's image; the page preview only fills a missing title or description, and the member's caption still wins over the page's description when both exist.
- **FR-005**: The snapshot job MUST be allowed to copy a locked host's preview image into image storage like any other link's, with no extra retries for locked hosts (015's one-try rule stays).
- **FR-006**: Link checks for locked hosts MUST stay as in 015 (not probed).

**Video host lookups**

- **FR-007**: For links on YouTube, TikTok and Vimeo, when the page gives no usable image or title, the app MUST ask the host's public, key-free lookup for the title and thumbnail, through the same guarded outbound path as page fetches.
- **FR-008**: The set of supported lookup hosts MUST be one list shared by every place that builds previews; hosts that need an app key or account MUST NOT be on it.
- **FR-009**: A lookup failure MUST NOT fail a share, a snapshot or an editor preview; it only means less preview.

**Image choice**

- **FR-010**: When building a preview from a page, the app MUST choose the image in this order: Open Graph image, secure Open Graph image, Twitter card image, structured-data image, `image_src` link, video poster, then the largest suitable image in the article's readable content.
- **FR-011**: An in-article image MUST count only when the page states its size (its own width and height, or the widths it offers) and that size is at least a minimum set in the plan, and its markup does not mark it as an icon, logo, avatar, emoji, tracking pixel or spacer. Images with no stated size are not chosen from the article.
- **FR-012**: Candidate image URLs MUST be resolved to absolute http(s) URLs and MUST respect the existing preview image URL length limit.
- **FR-013**: When the chosen image can't be copied (download fails, not an image, too small, too big), the snapshot job MUST try the next candidate, up to a fixed small number (set in the plan), and MUST keep the remote image off the card when none works.

**Existing cards**

- **FR-014**: The snapshot job MUST also take live link cards that have a title or description but no image and no stored image, once per card under the new rules; a card a member gave or removed an image on MUST be left alone.
- **FR-015**: A one-time pass MUST queue existing live link cards that qualify under FR-014, spread over time so no host gets a burst.

**Title honesty**

- **FR-016**: When the source gives neither a real title nor a caption, the extracted card MUST NOT invent a description of the content; it states what is known (the host and that the content couldn't be read) or leaves the description empty.

**Accountability (constitution VIII)**

- **FR-017**: Each preview build MUST record which source supplied the image and title (page Open Graph, another page tag, structured data, article image, host lookup, member share, none) and, when a page preview was discarded, why (generic, login wall, fetch failed, lookup failed), with ids and host names only, never URLs, titles or captions.
- **FR-018**: The share of locked-host previews that came back real versus generic MUST be observable per host, so a host that starts walling the crawler is noticed.

### Key Entities

- **Link preview**: the card's title, description and image (remote address plus the stored copy and its size). Unchanged in shape; this feature changes where its values can come from.
- **Image candidate**: one possible preview image found on a page or from a host lookup, with where it came from and its stated size if known. Ordered by FR-010; not stored on the card.
- **Lookup host**: a host with a public, key-free lookup for title and thumbnail (YouTube, TikTok, Vimeo).
- **Preview decision**: the recorded outcome of one preview build (FR-017), for watching how well previews work.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A share of a public Instagram post that arrives as a bare link produces a card with the post's image and real title, when the host answers the crawler with a preview (checked against the production host before the plan is final).
- **SC-002**: On the committed set of saved test pages, at least 90% of pages that carry an image in any supported way get that image as their preview, up from the share that carry an Open Graph image today.
- **SC-003**: On the same set, no page that gets a preview today loses it.
- **SC-004**: Shares of public YouTube, TikTok and Vimeo links show a thumbnail in at least 95% of cases where the host's lookup is up.
- **SC-005**: No share fails because of host lookups or extra image candidates, and a share's time from sent to proposed grows by at most 3 seconds in the worst case.
- **SC-006**: Reviewers no longer see made-up titles or descriptions on cards for links whose content couldn't be read.
- **SC-007**: After the one-time pass, existing live link cards without an image that now have one available show it, and no member-edited image is changed.

## Assumptions

- Instagram and similar hosts serve link previews to self-identified crawlers on purpose (that is how chat apps unfurl links); this was seen from a developer machine and must be confirmed from the production host before planning is final. If production is walled, User Story 1 falls back to 015's behaviour and the other stories still deliver.
- A self-identifying crawler identity follows the hosts' published rules better than a browser-like one; it is not a way around a login wall, and no request ever logs in, uses cookies or runs page scripts.
- X (Twitter) is not covered by a key-free lookup; it gets whatever its page gives the crawler. Its unofficial data endpoints are out of scope.
- The existing outbound limits (timeouts, size caps, redirect limits, address checks) apply to host lookups unchanged.
- No new card type and no video playback; the image is a still picture (cover, thumbnail or poster).
- No database schema change is expected: the link preview already has room for the image, its stored copy and its size.
- Test pages and lookup answers are saved fixtures; tests never call real sites (as today).
