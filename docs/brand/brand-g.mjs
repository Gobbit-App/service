/**
 * Custom brand G letterforms, drawn as one rounded stroke so they read as
 * Gobbit rather than a geometric-sans G:
 *   card     — G traced around a rounded card (not a circle), stroke crossbar
 *   bit      — card G whose crossbar is a yellow "bit" (same as the chimney bits)
 *   portrait — bit G on portrait card proportions
 *   tilt     — bit G leaning like a card being dealt
 *   spur     — card G whose bar drops into a short spur (a "tab")
 */
const f = (n) => Number(n.toFixed(1));

const VARIANTS = {
  card: { aspect: 0.92, bar: 'stroke' },
  bit: { aspect: 0.92, bar: 'bit' },
  portrait: { aspect: 0.74, bar: 'bit' },
  tilt: { aspect: 0.92, bar: 'bit', rot: -9 },
  spur: { aspect: 0.92, bar: 'spur' },
};

export const BRAND_G = Object.keys(VARIANTS);

/** Draw brand G `variant` centred on (cx, cy), `height` tall including the stroke. */
export function brandG(variant, cx, cy, height, fill, accent) {
  const v = VARIANTS[variant];
  if (!v) throw new Error(`unknown brand G variant "${variant}"`);
  const sw = height * 0.2,
    H = height - sw,
    W = height * v.aspect - sw,
    a = W / 2,
    b = H / 2,
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
  ];
  if (v.bar === 'stroke') outline.push(`L${f(a * 0.05)} ${f(barY)}`);
  if (v.bar === 'spur')
    outline.push(`L${f(a * 0.12)} ${f(barY)}`, `L${f(a * 0.12)} ${f(barY + b * 0.3)}`);
  const stroke = `<path d="${outline.join(' ')}" fill="none" stroke="${fill}" stroke-width="${f(sw)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const bs = sw * 1.25,
    bx = -a * 0.04,
    by = barY;
  const bit =
    v.bar === 'bit'
      ? `<rect x="${f(bx - bs / 2)}" y="${f(by - bs / 2)}" width="${f(bs)}" height="${f(bs)}" rx="${f(bs * 0.28)}" fill="${accent}" transform="rotate(14 ${f(bx)} ${f(by)})"/>`
      : '';
  return `<g transform="translate(${f(cx)} ${f(cy)})${v.rot ? ` rotate(${v.rot})` : ''}">${stroke}${bit}</g>`;
}
