# Gobbit logo (draft)

"House of know-how": two leaning cards form the roof of a home built from cards; the upright card carries the brand **g**, and bits of know-how rise from the chimney — knowledge kept at home and shared with your people.

| File                                                             | Use                                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `logo.svg`                                                       | Main mark on white — lowercase g                                 |
| `logo-app-icon.svg`                                              | Inverted mark on teal — base for the favicon and PWA icons       |
| `logo-capital-g.svg`                                             | Alternative: custom card G with a yellow bit as its bar          |
| `logo-app-icon-capital-g.svg`                                    | Card-G app icon                                                  |
| `logo-capital-g-tilt.svg` (+ `logo-app-icon-capital-g-tilt.svg`) | Card G leaning like a dealt card                                 |
| `preview.png`                                                    | g / g icon / G / G icon / tilted G / tilted G icon               |
| `generate-logo.mjs`, `glyphs.mjs`                                | Parametric source; g is an Inter ExtraBold outline               |
| `brand-g.mjs`                                                    | Custom G letterforms (`card`, `bit`, `portrait`, `tilt`, `spur`) |

Regenerate the main mark (writes `v-logo.svg` to the current dir):

```sh
node docs/brand/generate-logo.mjs '{"logo":{"theta":56,"h":200,"w":92,"bodyW":236,"bodyAspect":0.92,"tuckTo":36,"chimney":true,"bitScale":1.3,"frame":false,"door":false,"letter":"g","letterPlace":"center","letterScale":1.4}}'
```

Custom G: `"letter":"G:bit","letterScale":1.2` (or `G:tilt` at 1.15). It is traced around a rounded card instead of a circle and its bar is a chimney bit, so it doesn't read as a geometric-sans (Google-like) G.

App icon: add `"bg":"#1f6869","left":"#ffffff","right":"#d7f0db","body":"#d7f0db","mark":"#195b5c","stack":"#ffffff","pad":60`.

Other layers: `door`, `lines` (card content lines), `frame` (inset card border), `bite`, `windows`, `letterPlace: "index" | "door"`, `bitShape: "card"`.

At 16 px the letter and bits blur — the 16 px favicon should drop the chimney. Not wired into `apps/web/public` yet.
