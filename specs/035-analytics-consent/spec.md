# Feature Specification: Analytics consent

**Feature Branch**: `035-analytics-consent`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Replace 'Do Not Track honoured' (031 FR-004, 033) with explicit analytics consent. Members: after sign-in a one-time prompt (Allow / No thanks) explains usage analytics; analytics runs unless the member declined (opt-out default, existing members included until they answer); choice stored server-side on the user (follows across devices), changeable in Settings → Privacy; changes write a decision/audit event (constitution VIII). Anonymous visitors (landing /welcome, public /p pages, share previews /s): a consent banner too, with the same default (on unless declined); choice stored on the device (no cookie), since those pages are server-rendered with almost no script. Tracker no longer honours Do Not Track; consent replaces it. Privacy note on landing and Settings updated. Payload rules from 033 (route patterns, member id, four content events, payload sanitising) unchanged."

Builds on [`031-landing-analytics`](../031-landing-analytics/spec.md) and [`033-app-analytics`](../033-app-analytics/spec.md). **Supersedes**, by owner decision:

- 031: the "Do Not Track" part of FR-004, the clarification "Cookie or consent banner? → Neither", and User Story 2 scenario 2. Its other guarantees stay: no cookies, no stored IP addresses, nothing typed into the waitlist form.
- 033: the "Do Not Track" part of FR-008, the Do Not Track clause of FR-013, User Story 3 scenario 3, and the assumption "identifying members by user id without a consent banner is acceptable". The payload rules stay unchanged: route patterns, fixed screen names, member id, the four content events and the single sanitising choke point.

## Clarifications

### Session 2026-11-02

- Q: Why replace Do Not Track? → A: Chrome and other browsers send Do Not Track whenever a user, a managed-browser policy or an extension turns it on. For the operator's own browser, and likely many members', that silently turned analytics off, while the operator needs usage data to improve the app. The signal is deprecated, carries no legal weight and is ignored by comparable privacy-friendly analytics tools. An explicit, visible choice replaces it.
- Q: What is the default before a person answers? → A: On unless declined. Analytics runs for a member or visitor until they choose "No thanks". Existing members are included until they answer.
- Q: Do anonymous pages get a banner too? → A: Yes. The landing page, public deck pages and share previews show a small consent banner with the same default (on unless declined).
- Q: Where is each choice kept? → A: A member's choice is kept on their account, so it follows them across devices. An anonymous visitor's choice is kept only in that browser, without a cookie, and is never sent to the server.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The operator sees members who have Do Not Track on (Priority: P1)

Members whose browser sends Do Not Track (by personal setting, workplace policy or extension) now appear on the analytics dashboard, unless they personally said "No thanks". The operator gets usage numbers from the people actually using the app.

**Why this priority**: it is the reason for the change. The operator's own browser showed zero member sessions on the dashboard because of Do Not Track.

**Independent Test**: with analytics configured, sign in with a browser that sends Do Not Track and never answer the prompt. Open two screens. The dashboard for today shows that member's identified session and both page views.

**Acceptance Scenarios**:

1. **Given** a member whose browser sends Do Not Track and who has not answered, **When** they use the app, **Then** page views, content events and identification are sent exactly as in 033.
2. **Given** a member who chose "Allow", **When** they use the app on any device, **Then** analytics runs regardless of that browser's Do Not Track setting.
3. **Given** analytics is configured, **When** the operator asks how many members allowed, declined or haven't answered, **Then** they get the three counts.

---

### User Story 2 - A member makes a clear, lasting choice (Priority: P1)

After signing in, a member sees a short, non-blocking prompt. It explains that Gobbit measures which screens are used and when cards are created, edited, shared or deleted, linked to their user id, and never deck names, card content or search terms. It offers "Allow" and "No thanks". The answer is kept on their account and holds on every device, and they can change it at any time in Settings → Privacy.

**Why this priority**: consent replaces Do Not Track as the member's way to say no. Without a real choice, identified analytics would have no opt-out at all.

**Independent Test**: sign in as a new member, choose "No thanks", and check that nothing is sent to analytics. Sign in on a second device and check that no prompt appears and nothing is sent. Switch it on in Settings → Privacy and check that page views resume without reloading.

**Acceptance Scenarios**:

1. **Given** a signed-in member who has not answered, **When** the app opens, **Then** the prompt appears without blocking any screen or action, and analytics runs meanwhile.
2. **Given** the prompt, **When** the member chooses "No thanks", **Then** from that moment no page view, content event or identification is sent from this device, and the tracker is unloaded or never loaded.
3. **Given** the prompt, **When** the member chooses "Allow", **Then** it is not shown again on any device and analytics continues.
4. **Given** a member who declined on device A, **When** they open the app on device B, **Then** no prompt appears and nothing is sent from device B, including before the account's choice has loaded.
5. **Given** a member closes the prompt without choosing, **When** they next open the app, **Then** the prompt appears again; until they choose, analytics runs.
6. **Given** Settings → Privacy, **When** the member switches analytics off or on, **Then** the new choice is saved to their account, takes effect at once without reloading, and is shown with the date it was made.
7. **Given** a member changes their choice, **When** the change is saved, **Then** the system records who changed it, from what to what, where (prompt or settings) and when.

---

### User Story 3 - An anonymous visitor can say no (Priority: P2)

A visitor on the landing page, a public deck page or a share preview sees a small banner. It says the site counts anonymous page visits (no cookies, nothing personal) and offers "OK" and "No thanks". If they decline, nothing from that browser reaches analytics on any of those pages. The choice is remembered in that browser.

**Why this priority**: Do Not Track no longer protects visitors either, so they need the same visible way to say no. Anonymous visits carry no identity, which lowers the risk, hence P2.

**Independent Test**: open `/welcome` in a fresh browser and choose "No thanks". Open a public deck page and a share preview, and check that the banner is not shown again and nothing goes to analytics. Open the landing page's privacy link, choose to allow, and check that page views resume.

**Acceptance Scenarios**:

1. **Given** a visitor who hasn't answered, **When** they open the landing page, a public deck page or a share preview, **Then** the banner appears without covering the page's main action, and the page view is sent.
2. **Given** the banner, **When** the visitor chooses "No thanks", **Then** nothing further is sent to analytics from that browser on any of those pages, and the banner does not return.
3. **Given** a visitor who answered, **When** they follow the "Analytics" link in the landing page's privacy note or a public page's footer, **Then** they can see and change their choice.
4. **Given** a browser with scripts off, **When** the page loads, **Then** no banner and no tracker appear, and the page works as before.
5. **Given** a visitor's choice, **When** it is made or changed, **Then** nothing about it is sent to the server or to analytics.

---

### User Story 4 - People know what is measured (Priority: P2)

The landing page's privacy note and Settings → Privacy say plainly what analytics measures, that it is on unless you decline, how to decline, and that Do Not Track no longer turns it off.

**Why this priority**: constitution IV (private by default). This keeps 033's FR-013 promise now that the opt-out mechanism has changed.

**Independent Test**: read the landing privacy note and Settings → Privacy. Both name what is collected and what isn't, give the default and give the way to change it, and neither mentions Do Not Track as an off switch.

**Acceptance Scenarios**:

1. **Given** the landing page, **When** a visitor reads the privacy note, **Then** it describes anonymous page counting, the banner choice and the "Analytics" link to change it.
2. **Given** Settings → Privacy, **When** a member opens it, **Then** it explains in-app measurement with their user id, what is never collected, and the current choice with a switch to change it.
3. **Given** analytics is not configured on this server, **When** a member opens Settings → Privacy, **Then** it says no usage is measured, and no prompt or banner appears anywhere.

### Edge Cases

- A browser where the analytics tool's own off switch was set by hand (operator, smoke tests) stays silent whatever the choice; the account's choice is unaffected.
- A visitor declined on the landing page and then signs in on the same browser: until the member answers the prompt, nothing is sent from that browser. The member's own answer then governs. The device choice never changes the account's choice.
- A member signs out: that browser falls back to its anonymous choice (or the default) on the landing and public pages. The member's id is never sent after sign-out.
- A member changes their choice while offline: the switch says the change needs a connection and keeps the old value. Nothing is queued.
- A member declines on one device while another device is open: the other device stops sending on its next check of the account. Before that it may send at most the current screen's page view.
- The prompt and the banner never show on sign-in pages, `/auth/error`, error pages or emails. Those stay untracked, as in 033.
- The prompt must not cover Browse's dock or the editor's save action (034), and must not appear while the editor has unsaved input.
- Smoke tests run with analytics off or with the tracker disabled in the browser (031/033). The prompt is non-blocking, so no journey has to dismiss it.
- Bots and link-preview crawlers run no scripts: no banner, no page view (unchanged).
- Clearing site data resets an anonymous visitor's choice to "not answered". A member's choice is unaffected because it lives on the account.
- A forged request that claims a member's choice can only change that member's own choice, and only with their session.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Analytics MUST no longer consult Do Not Track. Whether anything is sent depends only on whether analytics is configured and on the person's consent choice.
- **FR-002**: Each signed-in member MUST have one analytics choice on their account: not answered, allowed or declined. Existing members start as not answered.
- **FR-003**: Analytics MUST run for a member whose choice is allowed or not answered, and MUST send nothing (no page view, content event or identification) for a member who declined. A device that has never seen the member's choice waits for it before sending; a device that has seen it uses the last known value until the account refreshes.
- **FR-004**: A member whose choice is not answered MUST see a non-blocking prompt in the app with "Allow" and "No thanks". It explains what is measured, that it is linked to their user id, what is never collected, and where to change it later. It reappears on each app start until answered.
- **FR-005**: Settings → Privacy MUST show the member's current choice and when they made it, and MUST let them switch between allowed and declined. A change takes effect on the current device immediately and on other devices at their next account refresh.
- **FR-006**: Every change to a member's choice MUST be recorded in the same step as the change: actor (the member), previous and new value, source (prompt or settings), time and request id. No other personal data is recorded. Saving the same value again records nothing.
- **FR-007**: The operator MUST be able to count members by choice (allowed, declined, not answered) without opening analytics.
- **FR-008**: The landing page, public deck pages and share previews MUST show a consent banner to visitors who haven't answered, with "OK" and "No thanks", only when analytics is configured and scripts run. A footer or privacy-note "Analytics" link lets visitors reopen it.
- **FR-009**: A visitor's choice MUST be kept only in their browser, without a cookie. It applies to all anonymous pages on the same site and is never sent to the server or to analytics. A visitor who declined sends nothing.
- **FR-010**: On a browser where the visitor declined, nothing MUST be sent after sign-in until the member answers the prompt or their account already says allowed.
- **FR-011**: The prompt and banner MUST NOT block, delay or change navigation or any member action. They MUST not cover the main action of the screen, and they MUST be reachable and operable by keyboard and screen reader.
- **FR-012**: The landing privacy note and Settings → Privacy MUST state what is measured and what isn't, the default (on unless declined), and how to decline. Neither may present Do Not Track as an off switch.
- **FR-013**: With analytics unconfigured, no prompt, banner or analytics link MUST appear, and Settings → Privacy MUST say no usage is measured. 033's FR-010 still holds.
- **FR-014**: 033's payload rules MUST hold unchanged: route patterns, fixed screen names, referrer origin, member id, the four content events and the single sanitising choke point. 031's and 033's no-cookie, no-IP, same-origin, offline and bundle-budget rules also stay.
- **FR-015**: The service MUST announce at start that analytics is consent-based, and how many members have declined MUST be observable alongside the analytics-versus-activity-log alert from 033 (constitution VIII), so a fall in recorded usage can be told apart from a breakage.

### Key Entities

- **Member analytics choice**: on the user's account. Value is not answered, allowed or declined; it also records when it was last changed and from where (prompt or settings).
- **Consent change record**: a decision/audit entry per change, holding member id, from, to, source, time and request id.
- **Visitor analytics choice**: kept in one browser only. Value is not answered, allowed or declined, with the date it was made. Never sent anywhere.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member whose browser sends Do Not Track and who hasn't declined appears on the dashboard the same day (verified by test with Do Not Track on).
- **SC-002**: After a member declines, zero requests reach analytics from any of their devices once those devices have refreshed the account (verified by test across two browser contexts).
- **SC-003**: A member can find and change their choice in Settings → Privacy in under 30 seconds, and a visitor can decline from the banner in one tap.
- **SC-004**: The operator can read how many members allowed, declined or haven't answered in under 1 minute.
- **SC-005**: With the prompt or banner showing, every smoke journey passes unchanged, and no page's main action is covered on a 360 px-wide screen.
- **SC-006**: Zero cookies are set, and zero analytics requests carry the visitor's choice or any 033-forbidden field (verified by test).
- **SC-007**: The initial web bundle stays within its budget, and the anonymous pages gain no more than 2 KB of script.

## Assumptions

- Owner decision: "on unless declined" (opt-out) is acceptable for this invite-only phase, provided the prompt, banner and privacy notes say so plainly. Phase 11's privacy review revisits it, including legal opt-in requirements for wider launch, Global Privacy Control, and erasing a deleted member's analytics rows.
- Global Privacy Control is not honoured, for the same reason as Do Not Track. Phase 11 decides whether it should be.
- If what analytics collects changes materially in a later feature, that feature decides whether to reset choices to "not answered". This feature does not provide a bulk reset.
- The member choice is part of the account. The GDPR export (Phase 11) will include it, which needs no work now.
- The anonymous pages stay server-rendered. The banner adds only a small first-party script that runs alongside the existing analytics loader, with no framework.
- The current Umami deployment and site id are reused. Umami's own per-browser off switch stays available to the operator and smoke tests.
- The dashboard stays operator-only (031/033).
