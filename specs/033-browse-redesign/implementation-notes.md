# Implementation notes: 033-browse-redesign

Plan: `specs/033-browse-redesign/plan.md`, tasks: `tasks.md`. Branch `feat/033-browse-redesign`. Web only: no API, schema, OpenAPI or env change. E2E tier: smoke.

## Decisions not specified by the plan

- **Next on the last card goes to the end page.** The end page is part of the track, so Next reaches it like any other page. Previous is disabled on the first card.
- **The dock hides on the end page.** Its two buttons are the page's only content, and card actions have no card to act on there.
- **The All end page reads "You've seen every card"**; a category's reads "That's all in <category>".
- **Chips are plain `<button>`s** styled in `browse.css`. They are text-only navigation items with no icon, so `ui/buttons` (ADR-059, actions) doesn't apply.
- **A chip switch clears `i`**; the settle writes the first card's id once the new track is current.
- **The offline banner is restyled inside Browse** (`body:has(.browse) .offline-banner`): a pill under the top bar that takes no taps. The sticky banner covered the chips, and smoke e2e caught it.
- **No focus ring on the page headings** (card title, end title). They take focus only so a screen reader announces the new page.
- **No D212 tooltip on the end page's and hint's buttons.** Their labels stay visible on narrow screens there, and the focused "Got it" tooltip covered the last tip.

## Deviations from the plan

- **FR-007** said Previous and Next are disabled at the ends. Next on the last card moves to the end page instead (see above).
