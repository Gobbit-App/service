# Gobbit logo

"House of know-how": two leaning cards form the roof of a home built from cards; the upright card carries the brand **G**, and bits of know-how rise from the chimney — knowledge kept at home and shared with your people.

The G is drawn for Gobbit, not set in a font: one rounded stroke traced around a card (not a circle, so it doesn't read as a geometric-sans G) with a yellow bit — the same rounded square that rises from the chimney — in its mouth as the bar. This is the only Gobbit mark; there is no lowercase-g version.

| File                | Use                                                        |
| ------------------- | ---------------------------------------------------------- |
| `logo.svg`          | Main mark on white                                         |
| `logo-app-icon.svg` | Inverted mark on teal — base for the favicon and PWA icons |
| `preview.png`       | Main mark / app icon                                       |
| `generate-logo.mjs` | Parametric source (defaults = the main mark)               |
| `brand-g.mjs`       | The brand G letterform                                     |

Regenerate both SVGs (no font needed; writes to the current dir):

```sh
cd docs/brand && node generate-logo.mjs
```

Experiments: `node generate-logo.mjs '{"name":{...opts}}'` writes `v-name.svg`. Other layers kept for exploration: `door`, `lines`, `frame`, `bite`, `windows`, `bitShape: "card"`.

Palette: dark `#195b5c`, mid `#2a7a7b`, mint `#d7f0db`, accent `#f4b942`, app-icon background `#1f6869`.

At 16 px the bits blur — the 16 px favicon should drop the chimney. Not wired into `apps/web/public` yet.
