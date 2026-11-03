# Gobbit logo (draft)

"House of cards": two leaning cards form the roof, resting on an upright card with a card frame and a door — a deck of know-how that is home for your people.

| File                | Use                                                         |
| ------------------- | ----------------------------------------------------------- |
| `logo.svg`          | Mark on white (teal/mint palette)                           |
| `logo-app-icon.svg` | Inverted mark on teal — base for the favicon and PWA icons  |
| `preview.png`       | Side-by-side preview                                        |
| `generate-logo.mjs` | Parametric source; writes `v-<name>.svg` to the current dir |

Regenerate the mark:

```sh
node docs/brand/generate-logo.mjs '{"logo":{"theta":50,"h":200,"w":96,"tuckTo":40,"bodyAspect":1.25}}'
```

Not wired into `apps/web/public` yet.
