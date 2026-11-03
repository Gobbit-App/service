# Quickstart: Rich-text card bodies (038)

## Prerequisites

`pnpm install`, Docker running, `.env` from `.env.example`, `pnpm db:migrate && pnpm db:seed`.

## Automated checks

```
pnpm --filter @gobbit/shared exec vitest run src/rich-text   # vocabulary, normaliser, palette contrast
pnpm --filter @gobbit/api exec vitest run src/rich-text src/share # server render, plain text
pnpm --filter @gobbit/web exec vitest run src/cards src/editor    # reader + editor units
pnpm build:web && pnpm budget                       # initial JS ≤ 150 KB, editor in its own chunk
pnpm test:e2e -- smoke/editor.spec.ts               # format → save → rendered
pnpm test:e2e -- full/rich-text.spec.ts             # toolbar keyboard, colours, public page
```

## Manual walk-through

1. `pnpm dev`, sign in, open `/d/me/new`.
2. Type `Milk`, Shift+Enter, `Eggs`; select `Eggs`, tap **Bold** and the red swatch. The meter
   counts the Markdown (`Milk\n**:color[Eggs]{.red}**`; bold is written
   outside the style directives).
3. Save. The card shows two lines, "Eggs" bold and red; switch the OS to dark mode — the red is
   the dark-theme red.
4. Reopen the editor and Save without changes: no PATCH is sent.
5. Make the deck public and open `/p/<slug>/i/<id>`: same rendering; the
   `<meta name="description">` holds plain words only.
6. `PATCH /items/<id>` with body `:color[x]{.pink} <b>y</b>`: the card shows `x` unstyled and no
   `<b>` element.
