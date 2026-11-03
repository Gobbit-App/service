# Contract: card body Markdown (038)

A card body is a string of CommonMark with two additions, read identically by the app reader, the
public pages (`/p/…`) and the editor.

## 1. Line breaks (D283)

| Source | Renders |
|--------|---------|
| `Milk\nEggs` | `<p>Milk<br>Eggs</p>` |
| `One\n\nTwo` | `<p>One</p><p>Two</p>` |

## 2. Style directives (D282)

Generic text directives: `:name[label]{attributes}`. Only these are styles:

| Source | HTML |
|--------|------|
| `:u[text]` | `<u>text</u>` |
| `:small[text]` | `<span class="rt-small">text</span>` |
| `:large[text]` | `<span class="rt-large">text</span>` |
| `:color[text]{.red}` | `<span class="rt-color rt-color--red">text</span>` |

Colour names: `red`, `orange`, `green`, `blue`, `purple`, `grey`. Labels may contain other inline
Markdown and other style directives (`:large[:color[**x**]{.red}]`).

## 3. Everything else is plain content (FR-005)

| Source | Renders as |
|--------|-----------|
| `:color[hot]{.pink}` / `:color[hot]` / `:huge[hot]` | `hot` (label, unstyled) |
| `Re:Plan` (label-less directive) | `Re:Plan` (exact source) |
| `::leaf[x]` / `:::box` blocks | paragraph of the label / source; container children unwrapped |
| `:small[x]` inside a heading | `x` (headings are not sized) |
| `:u[unclosed` | literal text (the parser does not match it) |
| raw HTML `<b>x</b>` | dropped (never rendered as HTML) |
| `[x](javascript:…)` | link without the unsafe target |

## 4. Plain text (FR-017)

`toPlainText(body)`: block texts joined by a space, breaks as spaces, every Markdown and directive
marker removed, labels kept. `toModelText(body)`: style directives unwrapped to their labels,
standard Markdown kept.

## 5. Editor output (FR-010, FR-013)

The editor writes standard Markdown plus the directives above; a line break is written as a single
newline. Untouched content is reported back byte-for-byte unchanged.
