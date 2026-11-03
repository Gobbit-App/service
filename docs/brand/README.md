# Gobbit logo (draft)

"House of know-how": two leaning cards form the roof of a home built from cards. The upright card carries content lines like a Gobbit card, and bits of know-how rise from the chimney — knowledge kept at home and shared with your people.

| File                | Use                                                         |
| ------------------- | ----------------------------------------------------------- |
| `logo.svg`          | Mark on white (teal/mint, yellow accent bits)               |
| `logo-app-icon.svg` | Inverted mark on teal — base for the favicon and PWA icons  |
| `preview.png`       | Side-by-side preview                                        |
| `generate-logo.mjs` | Parametric source; writes `v-<name>.svg` to the current dir |

Regenerate the mark (app icon: add the colour overrides used for `logo-app-icon.svg`):

```sh
node docs/brand/generate-logo.mjs '{"logo":{"chimney":true,"lines":true,"frame":false,"bitScale":1.4}}'
```

Other layers to try: `frame` (inset card border), `bite` (bite out of the roof card), `windows` (lit windows), `bitShape: "card"` (bits as tiny cards).

At 16 px the content lines and bits blur — the 16 px favicon should use the plain house (`lines: false`, `chimney: false`). Not wired into `apps/web/public` yet.
