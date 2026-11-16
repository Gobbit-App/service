# UI system (D416, ADR-079)

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md) (ADR-079). Constitution X._

The web app already has a design system: tokens in `styles.css`, the `ui/` primitives and the form rhythm (D323). This page collects the rules so new work extends that system instead of inventing its own. It adds nothing new. Each rule points to where the system already lives.

**If a rule does not fit**, don't work around it. Record the exception in the plan's Complexity Tracking with the alternative you rejected. If the same exception keeps coming back, change this page.

## 1. Start from a sibling

Every new screen, field or control names an **existing sibling** it copies: a screen, field or component already in the app that does the same job. Copy the sibling's structure, classes and spacing, then change only what differs. The plan records this on its "UI reference" line, and each UI task names it too.

| Building… | Copy |
| --- | --- |
| A form field (label + control) | `.field` (`editor/fields/TextInput.tsx`) |
| A control with its own actions (pick/replace/remove, fetch) | `.field-group` around the control and its action row (`editor/fields/LinkFields.tsx`: URL + `.link-tools`) |
| An image preview in a form | `.image-fields__photo` (max 360 px) |
| Upload progress / failure | `.image-fields__progress`, `.image-fields__failed` with `useImageUpload` |
| A list of repeating items | the deck list rows / `.gallery-fields__list` (grid, `--gap`, no borders, D383) |
| A settings block | `.settings-section` with an `h2` |
| A panel or chooser over the page | `ui/sheet/Sheet` (ADR-071) |
| Empty, loading, error | `ui/StatusViews` |
| A transient message with Undo | `ui/UndoToast` |

If nothing in the app is close, say so on the plan's UI reference line ("none: <why>"). The plan then has to describe the layout in the same terms as this page.

## 2. Structure

- **Every element sits in a named block, and the block has a CSS rule.** A wrapper `className` with no selector anywhere is a bug: that is how the 044 cover field lost all its spacing. `ui-system.test.ts` fails on a new unstyled class. A class kept only as a test or scope hook must also carry a layout class (e.g. `className="field-group cover-field"`).
- **Rhythm comes from the parent's `gap`** (grid or flex), never from margins on the children. Use the D323 steps:
  - 4 px between a label and its control (`.field`)
  - 8 px between a control and its own actions (`.field-group`)
  - 24 px between separate fields and sections (`.editor__fields`, `.composer-section__body`)
  - `--gap` between repeating items
- **Actions that belong together form one row** under the thing they act on. Use `display: flex; flex-wrap: wrap; align-items: center; gap`, as in `.image-fields__pick` and `.link-tools`. The row is left-aligned (start), with the primary action first and the destructive one last. Never stack separate full-width buttons.
- **Media is capped**: in forms by the sibling's max width; in reading views by `CloudImage` with its box taken from the stored dimensions (D161).
- **One column on phones.** A second column appears only at a listed breakpoint, and only if the sibling has one.

## 3. Tokens only

The values live in [web-pwa.md › App palette and themes](web-pwa.md#app-palette-and-themes-d383).

- **Spacing**: `--space-1`…`--space-7` (4/8/12/16/24/32/48), `--gap`, `--gutter`. Raw px are allowed only for measures, never spacing: an icon or media size, a max width, a hairline.
- **Type**: `--text-xs`…`--text-2xl`; labels and titles at weight 600 like `.field__label`.
- **Colour**: `--color-*`, `--card-*`, `--accent-*` only. A hex or `rgb()` outside the `:root` blocks fails review. New colours are tokens with both `light-dark()` sides, and `styles.test.ts` checks their contrast.
- **Shape and depth**: `--radius*` (0), `--elevation-*`, the glass/solid surface tiers (D383). Don't add new shadows or borders between repeating items.
- **Motion**: `--motion-fast`/`--motion-base` with `--ease-out`, inside `prefers-reduced-motion: no-preference`.
- **Breakpoints**: 480 px (`max-width: 479.98px` collapses `Button` labels, D211), 600 px (gutter, sheets as dialogs), 768 px (editor side by side). Other values in today's CSS (400, 760, 767) are legacy. Don't add new ones.
- **Touch**: every control is at least `--tap` (44 px).

`ui-system.test.ts` counts raw px spacing, raw font sizes and off-list breakpoints across `apps/web/src/**/*.css`. It fails if any count rises above its committed baseline. Lower the baseline when you remove some; never raise it.

## 4. Components

These are the only ways to render:

| What | Through |
| --- | --- |
| An action | `ui/buttons` (`Button`, `IconButton`, `ButtonLink`, `IconLink`) with an icon from `ui/icons` (ADR-059) |
| A file pick | `editor/fields/PickButton` |
| A stored image | `cards/CloudImage` |
| A body | `@gobbit/shared/rich-text` |
| A panel | `ui/sheet/Sheet` |
| A field error | `.field__error`, with `role="alert"` |

A new primitive belongs in `ui/` and needs an entry in this page.

## 5. Copy

- **Visible labels are short.** One or two words: a verb, plus a noun only when the context doesn't already name it ("Add image", "Replace", "Remove"). Put the full context in the accessible name (`aria-label`, or `PickButton`'s `ariaLabel`). Tests find controls by the accessible name.
- No explanatory sentences where a label, hint or empty state already does the job. Field hints go in `.field__hint`, one line.
- Sentence case, no trailing punctuation on labels, no glyphs (D210).

## 6. Checking it looks right

Unit tests run in jsdom, which renders no CSS. "The tests pass" therefore says nothing about layout.

- A task that changes `.tsx` or `.css` ends with screenshots of the changed screen at **phone width (412 px)** and **desktop width (1280 px)**, in light and dark, from the running app. Compare them side by side with the sibling. Spacing, alignment and label length should match.
- If the screenshots can't be taken (no browser, no app), the task is **blocked**, not done. Never report it done without them.
- The reviewer of a UI PR checks the screenshots against this page before merging.
