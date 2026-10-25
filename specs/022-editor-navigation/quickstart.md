# Quickstart: Editor navigation and unsaved-work guard

Validates [spec.md](./spec.md). Setup per `README.md`; no AI key needed. UI contract: [navigation-ui](./contracts/navigation-ui.md).

## 1. Automated

```sh
pnpm typecheck && pnpm lint
pnpm test:unit                         # back-target, baseline, guard, dialog, editor, review form
pnpm build:web && pnpm budget
# against the Compose stack (README "E2E"):
pnpm test:e2e --grep @smoke            # editor.spec.ts journey
pnpm test:e2e -- full/editor-navigation.spec.ts
```

## 2. By hand

1. Open a deck → a card → Edit. Tap the header back: you are on the card (no prompt).
2. Edit again, change the title, tap back: "Discard changes?" with Keep editing focused. Press Escape: still editing, text intact. Tap Cancel → Discard: the card shows its old title; reopening Edit offers no draft.
3. Edit, type, use the browser back: the dialog appears; Keep editing restores the address.
4. Edit, type, reload: the browser asks to leave; leave anyway; reopen Edit: "Restore unsaved draft?" with the latest text.
5. Review queue → Edit fully → back: the review queue. Inline Edit → change the title → Cancel: the dialog; Discard closes the form unchanged.
6. New card → back: the deck. Card page → back: its deck. Deck → back: deck list. Deck list: no back control.
7. Editor with changes → Sign out → Keep editing: still signed in; Sign out → Discard: signed out.
