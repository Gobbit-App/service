import { writeFileSync } from 'node:fs';
export const C = { dark: '#195b5c', mid: '#2a7a7b', mint: '#d7f0db', bg: '#ffffff' };
const rad = (d) => (d * Math.PI) / 180;
/** House-of-cards mark: two leaning roof cards (split at the ridge) resting on an upright card. */
export function logo(o = {}) {
  const {
    theta = 50,
    w = 88,
    h = 185,
    r = 18,
    apexR = 18,
    ridge = 8,
    bodyW = 200,
    bodyAspect = 1.3,
    tuckTo = 30,
    gap = 8,
    frame = true,
    door = true,
    pad = 30,
    bg = C.bg,
    left = C.dark,
    right = C.mint,
    body = C.mid,
    mark = C.mint,
    transparent = false,
  } = o;
  const s = Math.sin(rad(theta)),
    c = Math.cos(rad(theta)),
    far = 2000,
    k = apexR;
  const card = (mirror) =>
    `<g transform="${mirror ? 'scale(-1 1) ' : ''}rotate(${theta})"><rect width="${w}" height="${h}" rx="${r}"/></g>`;
  const roofClip = `<clipPath id="roof"><path d="M${-far * s} ${far * c} L${-k * s} ${k * c} Q0 0 ${k * s} ${k * c} L${far * s} ${far * c} Z"/></clipPath>`;
  const halfL = `<clipPath id="hl"><rect x="${-far}" y="${-far}" width="${far - ridge / 2}" height="${2 * far}"/></clipPath>`;
  const halfR = `<clipPath id="hr"><rect x="${ridge / 2}" y="${-far}" width="${far}" height="${2 * far}"/></clipPath>`;
  const roof = `<g clip-path="url(#roof)"><g clip-path="url(#hl)" fill="${left}">${card(false)}</g><g clip-path="url(#hr)" fill="${right}">${card(true)}</g></g>`;
  const bodyTop = h * c + tuckTo,
    bodyH = bodyW * bodyAspect,
    bx = -bodyW / 2;
  const sep = transparent ? '' : `stroke="${bg}" stroke-width="${gap * 1.5}" paint-order="stroke"`;
  const bodyEl = `<rect x="${bx}" y="${bodyTop}" width="${bodyW}" height="${bodyH}" rx="${r + 4}" fill="${body}" ${sep}/>`;
  const inset = bodyW * 0.075;
  const fr = frame
    ? `<rect x="${bx + inset}" y="${bodyTop + inset}" width="${bodyW - 2 * inset}" height="${bodyH - 2 * inset}" rx="${r - 4}" fill="none" stroke="${mark}" stroke-opacity=".6" stroke-width="${bodyW * 0.03}"/>`
    : '';
  const dw = bodyW * 0.3,
    dh = bodyH * 0.34,
    dx = -dw / 2,
    dy = bodyTop + bodyH - dh - (frame ? inset : 0);
  const dr = door
    ? `<path d="M${dx} ${dy + dh} V${dy + dw / 2} a${dw / 2} ${dw / 2} 0 0 1 ${dw} 0 V${dy + dh} Z" fill="${mark}"/>`
    : '';
  const reach = Math.max(h * s + 2, bodyW / 2);
  const minY = -pad,
    maxY = bodyTop + bodyH + pad,
    minX = -reach - pad;
  const size = Math.max(-2 * minX, maxY - minY),
    vx = -size / 2,
    vy = minY - (size - (maxY - minY)) / 2;
  const bgEl = transparent
    ? ''
    : `<rect x="${vx}" y="${vy}" width="${size}" height="${size}" fill="${bg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx.toFixed(1)} ${vy.toFixed(1)} ${size.toFixed(1)} ${size.toFixed(1)}" width="512" height="512"><defs>${roofClip}${halfL}${halfR}</defs>${bgEl}${roof}${bodyEl}${fr}${dr}</svg>`;
}
const variants = JSON.parse(process.argv[2] ?? '{}');
for (const [k, v] of Object.entries(variants)) writeFileSync(`v-${k}.svg`, logo(v));
