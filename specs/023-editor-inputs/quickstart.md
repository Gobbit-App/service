# Quickstart: Friendlier editor inputs

Validates [spec.md](./spec.md). Setup per `README.md`; no AI key needed. Contract: [editor-inputs](./contracts/editor-inputs.md).

## 1. Automated

```sh
pnpm test:unit                 # url-input table, use-url-input, image-alt, category-saver, editor
pnpm test:int                  # items.int (alt optional), item-events.int (save + undo)
pnpm api:openapi && git diff --exit-code packages/api-client
pnpm build:web && pnpm budget
pnpm test:e2e -- smoke/editor.spec.ts full/editor-inputs.spec.ts
```

## 2. By hand (`pnpm dev`, a phone-sized window)

1. New link card: tap URL → it shows `https://`; type `example.org/recipes`, tap elsewhere → `https://example.org/recipes`. Save; the card links to it.
2. Tap Source URL and leave it → empty again. Type `http://old.example` → kept as `http://`.
3. Type `hello world` in URL → Save refuses with "Enter a valid web address".
4. New image card: photo + title, Description left empty → Save works; the list shows the photo under its title (`alt=""` in devtools).
5. Edit an existing card: tap a second category chip → "Categories saved · Undo" appears; press the header back control → the card shows both categories, no prompt.
6. Edit again, tap the chip off, tap Undo → the chip is back; the deck's Activity shows two lines.
7. On a published card with one category, tap it → the chip stays on with "A published card needs at least one category."
8. Devtools offline, tap a chip → it flips back and the toast explains.
