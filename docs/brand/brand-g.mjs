/**
 * The brand G: one rounded stroke traced around a card (not a circle, so it
 * doesn't read as a geometric-sans G) with a yellow "bit" — the same rounded
 * square that rises from the chimney — sitting in its mouth as the bar.
 */
const f = (n) => Number(n.toFixed(1));

const ASPECT = 0.92; // width / height, matching the body card
const STROKE = 0.2; // stroke width / height

/** Draw the brand G centred on (cx, cy), `height` tall including the stroke. */
export function brandG(cx, cy, height, fill, accent) {
  const sw = height * STROKE,
    a = (height * ASPECT - sw) / 2,
    b = (height - sw) / 2,
    R = Math.min(a, b) * 0.62,
    barY = b * 0.08;
  const arc = (x, y) => `A${f(R)} ${f(R)} 0 0 0 ${f(x)} ${f(y)}`;
  const outline = [
    `M${f(a - R * 0.55)} ${f(-b)}`,
    `L${f(-a + R)} ${f(-b)}`,
    arc(-a, -b + R),
    `L${f(-a)} ${f(b - R)}`,
    arc(-a + R, b),
    `L${f(a - R)} ${f(b)}`,
    arc(a, b - R),
    `L${f(a)} ${f(barY)}`,
  ].join(' ');
  const stroke = `<path d="${outline}" fill="none" stroke="${fill}" stroke-width="${f(sw)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const bs = sw * 1.25,
    bx = -a * 0.04;
  const bit = `<rect x="${f(bx - bs / 2)}" y="${f(barY - bs / 2)}" width="${f(bs)}" height="${f(bs)}" rx="${f(bs * 0.28)}" fill="${accent}" transform="rotate(14 ${f(bx)} ${f(barY)})"/>`;
  return `<g transform="translate(${f(cx)} ${f(cy)})">${stroke}${bit}</g>`;
}
