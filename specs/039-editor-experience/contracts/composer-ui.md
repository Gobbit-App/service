# Contract: composer UI roles, names and keys (039)

Tests (unit and e2e) rely on these accessible roles and names. Changing one is a contract change:
update this file and the e2e specs together.

## Top bar (`banner` region inside the composer form)

| Control | Role / name | Notes |
|---------|-------------|-------|
| Close | link "Close" | goes to the D200 back target, so the leave guard decides |
| Title | heading level 1 "New card" / "Edit card" | the deck name follows as text |
| Preview | button "Preview", `aria-pressed` | rendered below 768 px only (CSS hides it from 768 px) |
| Save | button "Save" (`type=submit`) | `aria-disabled` + reason when blocked, `aria-busy` while saving |

## Type chooser (`/d/{slug}/new` without a usable `?type=`)

- `radiogroup` "Card type", one `radio` per type named by its label (Text, Reminder, Link, Image,
  Table, Calc), described by its hint. None is checked on the chooser.
- Keys: ←/→/↑/↓ move focus (wrapping), Home/End go to the first/last tile, Enter/Space pick.
- Image without storage: `aria-disabled="true"` and the reason in the description.

## Type control (new card, inside the composer)

- button "Card type: {Label}" opens dialog "Choose a card type" with the same `radiogroup`, the
  current type checked.
- Switch confirm: dialog "Switch to {Label}?" with buttons "Keep {Current}" (initial focus) and
  "Switch" (danger).
- Edit: text "{Label} card" with the type's icon, no control.

## Canvas

- Textbox "Title", the body editor named "Body", sections "Details" and the type section ("Link",
  "Photo", "Table", "Calculator", "Reminder") as `region`s.
- Counter text "{used} / {max} characters" appears from 80 % of the limit.
- Save error: `alert` at the top of the writing area.
- Preview: `region` "Preview" (as before).

## Keys

| Key | Effect |
|-----|--------|
| Ctrl/Cmd+Enter | submit (same as Save) |
| Escape | close an open sheet/panel → else close the preview (narrow) → else Close |

## Sheets

`dialog` (native, modal). Bottom sheet below 600 px, centred from 600 px. The leave guard keeps its
names: dialog "Discard changes?", buttons "Keep editing" and "Discard".
