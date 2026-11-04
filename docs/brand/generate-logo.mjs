import { writeFileSync } from 'node:fs';
import { brandG } from './brand-g.mjs';

export const C = {
  dark: '#195b5c',
  mid: '#2a7a7b',
  mint: '#d7f0db',
  accent: '#f4b942',
  bg: '#ffffff',
};
const rad = (d) => (d * Math.PI) / 180;
const f = (n) => Number(n.toFixed(1));

/** Rounded square "bit". */
const bit = (x, y, size, fill, rot = 0) =>
  `<rect x="${f(x - size / 2)}" y="${f(y - size / 2)}" width="${f(size)}" height="${f(size)}" rx="${f(size * 0.28)}" fill="${fill}" transform="rotate(${rot} ${f(x)} ${f(y)})"/>`;

/** Small portrait card ("gobbit") for the rising bits. */
const miniCard = (x, y, size, fill, rot = 0) =>
  `<rect x="${f(x - size * 0.36)}" y="${f(y - size / 2)}" width="${f(size * 0.72)}" height="${f(size)}" rx="${f(size * 0.18)}" fill="${fill}" transform="rotate(${rot} ${f(x)} ${f(y)})"/>`;

/** Chimney on the right roof slope with bits rising out of it like smoke. */
function chimney({ s, c, h, bodyW, color, accent, bitShape = 'square', bitScale = 1, bitColors }) {
  const cw = bodyW * 0.2,
    x0 = h * s * 0.38,
    slopeY = (x) => (x * c) / s,
    top = slopeY(x0) - bodyW * 0.2;
  const stack = `<rect x="${f(x0)}" y="${f(top)}" width="${f(cw)}" height="${f(slopeY(x0 + cw) - top + 20)}" rx="${f(cw * 0.22)}" fill="${color}"/>`;
  const cx = x0 + cw / 2,
    u = bodyW * bitScale;
  const shape = bitShape === 'card' ? miniCard : bit;
  const colors = bitColors ?? [accent, accent, accent];
  const specs = [
    [0.0, 0.1, 0.12, 14],
    [0.1, 0.21, 0.09, -12],
    [0.21, 0.29, 0.065, 24],
  ];
  const bits = specs
    .map(([dx, dy, sz, rot], i) => shape(cx + u * dx, top - u * dy, u * sz, colors[i], rot))
    .join('');
  return { stack, bits, minY: top - u * 0.34, maxX: cx + u * 0.26 };
}

/** Bite taken out of the right roof card (mask) plus crumbs. */
function bite({ s, c, h, w, theta, accent }) {
  const t = 0.62,
    br = h * 0.13;
  // centre on the right card's outer edge
  const bx = t * h * s,
    by = t * h * c;
  const mask = `<mask id="bite" maskUnits="userSpaceOnUse" x="-2000" y="-2000" width="4000" height="4000"><rect x="-2000" y="-2000" width="4000" height="4000" fill="#fff"/><circle cx="${f(bx + br * 0.25)}" cy="${f(by - br * 0.35)}" r="${f(br)}"/></mask>`;
  const crumbs = [
    bit(bx + br * 1.25, by - br * 0.9, w * 0.13, accent, 15),
    bit(bx + br * 1.6, by - br * 0.05, w * 0.09, accent, -12),
  ].join('');
  void theta;
  return { mask, crumbs };
}

/** The brand G (brand-g.mjs) `height` tall, centred on (cx, cy). */
const glyph = (cx, cy, height, fill, accent) => brandG(cx, cy, height, fill, accent);

/** Two short content lines, like the text on a Gobbit card. */
const contentLines = ({ bx, top, bodyW, color, indent = 0 }) => {
  const x = bx + bodyW * (0.2 + indent),
    sw = bodyW * 0.07;
  return [0.72, 0.48]
    .map(
      (len, i) =>
        `<line x1="${f(x)}" y1="${f(top + bodyW * (0.22 + i * 0.15))}" x2="${f(x + bodyW * 0.6 * len)}" y2="${f(top + bodyW * (0.22 + i * 0.15))}" stroke="${color}" stroke-width="${f(sw)}" stroke-linecap="round"/>`,
    )
    .join('');
};

/** Two lit windows either side of the door. */
const windows = ({ bodyW, top, bodyH, accent }) => {
  const ws = bodyW * 0.17,
    y = top + bodyH * 0.38;
  return [-1, 1]
    .map(
      (side) =>
        `<rect x="${f(side * bodyW * 0.24 - ws / 2)}" y="${f(y)}" width="${f(ws)}" height="${f(ws)}" rx="${f(ws * 0.25)}" fill="${accent}"/>`,
    )
    .join('');
};

/**
 * House-of-cards mark: two leaning roof cards (split at the ridge) resting on an upright card.
 * Optional meaning layers: `chimney` (bits rising), `lines` (card content), `bite`, `windows`.
 */
export function logo(o = {}) {
  const {
    theta = 56,
    w = 92,
    h = 200,
    r = 18,
    apexR = 18,
    ridge = 8,
    bodyW = 236,
    bodyAspect = 0.92,
    tuckTo = 36,
    gap = 8,
    frame = false,
    door = false,
    lines = false,
    chimney: withChimney = true,
    bite: withBite = false,
    windows: withWindows = false,
    letter = true,
    letterScale = 1.2,
    letterColor,
    pad = 30,
    bg = C.bg,
    left = C.dark,
    right = C.mint,
    body = C.mid,
    mark = C.mint,
    accent = C.accent,
    stack = C.dark,
    bitShape = 'square',
    bitScale = 1.3,
    bitColors,
    transparent = false,
  } = o;
  const s = Math.sin(rad(theta)),
    c = Math.cos(rad(theta)),
    far = 2000,
    k = apexR;
  const card = (mirror) =>
    `<g transform="${mirror ? 'scale(-1 1) ' : ''}rotate(${theta})"><rect width="${w}" height="${h}" rx="${r}"/></g>`;
  const roofClip = `<clipPath id="roof"><path d="M${f(-far * s)} ${f(far * c)} L${f(-k * s)} ${f(k * c)} Q0 0 ${f(k * s)} ${f(k * c)} L${f(far * s)} ${f(far * c)} Z"/></clipPath>`;
  const halfL = `<clipPath id="hl"><rect x="${-far}" y="${-far}" width="${far - ridge / 2}" height="${2 * far}"/></clipPath>`;
  const halfR = `<clipPath id="hr"><rect x="${ridge / 2}" y="${-far}" width="${far}" height="${2 * far}"/></clipPath>`;

  const ch = withChimney
    ? chimney({ s, c, h, bodyW, color: stack, accent, bitShape, bitScale, bitColors })
    : null;
  const bt = withBite ? bite({ s, c, h, w, theta, accent }) : null;
  const rightCard = `<g clip-path="url(#hr)" fill="${right}"${bt ? ' mask="url(#bite)"' : ''}>${card(true)}</g>`;
  const roof = `<g clip-path="url(#roof)"><g clip-path="url(#hl)" fill="${left}">${card(false)}</g>${rightCard}</g>`;

  const bodyTop = h * c + tuckTo,
    bodyH = bodyW * bodyAspect,
    bx = -bodyW / 2;
  const sep = transparent ? '' : `stroke="${bg}" stroke-width="${gap * 1.5}" paint-order="stroke"`;
  const bodyEl = `<rect x="${bx}" y="${f(bodyTop)}" width="${bodyW}" height="${bodyH}" rx="${r + 4}" fill="${body}" ${sep}/>`;
  const inset = bodyW * 0.075;
  const fr = frame
    ? `<rect x="${bx + inset}" y="${f(bodyTop + inset)}" width="${bodyW - 2 * inset}" height="${bodyH - 2 * inset}" rx="${r - 4}" fill="none" stroke="${mark}" stroke-opacity=".6" stroke-width="${bodyW * 0.03}"/>`
    : '';
  const dw = bodyW * 0.3,
    dh = bodyH * 0.34,
    dx = -dw / 2,
    dy = bodyTop + bodyH - dh - (frame ? inset : 0);
  const dr = door
    ? `<path d="M${dx} ${f(dy + dh)} V${f(dy + dw / 2)} a${dw / 2} ${dw / 2} 0 0 1 ${dw} 0 V${f(dy + dh)} Z" fill="${mark}"/>`
    : '';
  const lc = letterColor ?? mark;
  const letterEl = letter
    ? glyph(0, bodyTop + (door ? bodyH * 0.36 : bodyH / 2), bodyH * 0.5 * letterScale, lc, accent)
    : '';
  const ln = lines
    ? contentLines({
        bx,
        top: bodyTop,
        bodyW,
        color: mark,
      })
    : '';
  const wn = withWindows ? windows({ bodyW, top: bodyTop, bodyH, accent }) : '';

  const halfRoof = Math.max(h * s + 2, bodyW / 2);
  const minX = -halfRoof - pad,
    maxX = Math.max(halfRoof, ch ? ch.maxX : 0, bt ? h * s * 0.62 + h * 0.3 : 0) + pad;
  const minY = Math.min(-pad, ch ? ch.minY - pad : 0),
    maxY = bodyTop + bodyH + pad;
  const size = Math.max(maxX - minX, maxY - minY),
    vx = (minX + maxX) / 2 - size / 2,
    vy = minY - (size - (maxY - minY)) / 2;
  const bgEl = transparent
    ? ''
    : `<rect x="${f(vx)}" y="${f(vy)}" width="${f(size)}" height="${f(size)}" fill="${bg}"/>`;
  const defs = `<defs>${roofClip}${halfL}${halfR}${bt ? bt.mask : ''}</defs>`;
  const parts = [bgEl, ch?.stack, ch?.bits, roof, bt?.crumbs, bodyEl, fr, ln, wn, dr, letterEl];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vx)} ${f(vy)} ${f(size)} ${f(size)}" width="512" height="512">${defs}${parts.filter(Boolean).join('')}</svg>`;
}

/** App-icon colours: inverted mark on teal. */
export const APP_ICON = {
  bg: '#1f6869',
  left: '#ffffff',
  right: C.mint,
  body: C.mint,
  mark: C.dark,
  stack: '#ffffff',
  pad: 60,
};

// No args: write logo.svg + logo-app-icon.svg to the cwd.
// With args: '{"name":{...opts}}' → v-<name>.svg for experiments.
const arg = process.argv[2];
const variants = arg ? JSON.parse(arg) : null;
if (variants) {
  for (const [k, v] of Object.entries(variants)) writeFileSync(`v-${k}.svg`, logo(v));
} else {
  writeFileSync('logo.svg', logo());
  writeFileSync('logo-app-icon.svg', logo(APP_ICON));
}
