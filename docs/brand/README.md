# Gobbit logo

"House of know-how": two leaning cards form the roof of a home built from cards; the upright card carries the brand **G**, and bits of know-how rise from the chimney — knowledge kept at home and shared with your people.

The G is drawn for Gobbit, not set in a font: one rounded stroke traced around a card (not a circle, so it doesn't read as a geometric-sans G) with a yellow bit — the same rounded square that rises from the chimney — in its mouth as the bar. This is the only Gobbit mark; there is no lowercase-g version.

| File                | Use                                         |
| ------------------- | ------------------------------------------- |
| `logo.svg`          | Main mark on white                          |
| `logo-app-icon.svg` | Inverted mark on the rounded teal app tile  |
| `preview.png`       | Main mark / app icon                        |

The source is `apps/api/src/brand/` (`logo.ts`, `brand-g.ts`); `pnpm og:static` writes both SVGs here and every app file (favicon, PWA and Apple icons, header logo, OG images) to `apps/web/public`. Variants and where they are used: `docs/design/web-pwa.md` § Logo (D321).

Palette: dark `#195b5c` (also the app tile and `theme_color`), mid `#2a7a7b`, mint `#d7f0db`, bit yellow `#f4b942`.

Below ~64 px the rising bits blur, so the favicon and small lockups drop the chimney.
