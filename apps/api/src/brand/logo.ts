/**
 * D321: the Gobbit mark, a "house of know-how". Two leaning cards form the roof of a home built
 * from cards, the upright card carries the brand G, and bits of know-how rise from the chimney.
 * Pure SVG strings (no fonts), the single source for the favicon, app icons, header logo and
 * OG images (`pnpm og:static`).
 */
import { brandG, roundedSquare } from './brand-g';
import { fmt, rad } from './svg';

/** Brand colours. `dark`, `mint` are D272 tokens; `mid` and `accent` appear only in the mark. */
export const BRAND_COLORS = {
  dark: '#195b5c',
  mid: '#2a7a7b',
  mint: '#d7f0db',
  accent: '#f4b942',
} as const;

export type LogoPalette = {
  /** Tile background, also the stroke that separates the body card from the roof. */
  bg: string;
  left: string;
  right: string;
  body: string;
  /** The G. */
  mark: string;
  /** The chimney stack. */
  stack: string;
  /** The bits (chimney and the G's bar). */
  accent: string;
};

/** The main mark, on white. */
export const MARK_PALETTE: LogoPalette = {
  bg: '#ffffff',
  left: BRAND_COLORS.dark,
  right: BRAND_COLORS.mint,
  body: BRAND_COLORS.mid,
  mark: BRAND_COLORS.mint,
  stack: BRAND_COLORS.dark,
  accent: BRAND_COLORS.accent,
};

/** The inverted mark on a brand-teal tile (app icons, favicon, header logo). */
export const TILE_PALETTE: LogoPalette = {
  bg: BRAND_COLORS.dark,
  left: '#ffffff',
  right: BRAND_COLORS.mint,
  body: BRAND_COLORS.mint,
  mark: BRAND_COLORS.dark,
  stack: '#ffffff',
  accent: BRAND_COLORS.accent,
};

export type LogoOptions = {
  palette?: LogoPalette;
  /** Bits rising from a chimney; drop it where the mark is tiny (favicon). Default true. */
  chimney?: boolean;
  /** Space around the content, in mark units (the body card is 236 wide). Default 30. */
  pad?: number;
  /** Background corner radius as a fraction of the tile side. Default 0 (full bleed). */
  cornerRadius?: number;
  /**
   * Grow the tile so the content's bounding box fits the maskable safe zone (a circle of 40% of
   * the tile side around the centre). Overrides `pad`.
   */
  safeZone?: boolean;
  /** `width`/`height` attributes. Default 512. */
  px?: number;
};

/** Mark geometry, in mark units. */
const G = {
  /** Roof card lean from vertical, degrees. */
  theta: 56,
  cardW: 92,
  cardH: 200,
  cardR: 18,
  /** Radius of the rounded roof apex. */
  apexR: 18,
  /** Gap between the two roof cards at the ridge. */
  ridge: 8,
  bodyW: 236,
  bodyAspect: 0.92,
  /** How far below the roof tips the body card starts. */
  tuck: 36,
  /** Width of the separation stroke between body and roof. */
  gap: 12,
  /** The G's height relative to the body card. */
  letterScale: 0.6,
  bitScale: 1.3,
} as const;

/** The maskable safe zone radius as a fraction of the tile side. */
export const SAFE_ZONE_RADIUS = 0.4;

/** Rising bits relative to the chimney: [dx, dy, size, rotation] in units of `bodyW * bitScale`. */
const CHIMNEY_BITS: [number, number, number, number][] = [
  [0, 0.1, 0.12, 14],
  [0.1, 0.21, 0.09, -12],
  [0.21, 0.29, 0.065, 24],
];

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

const SIN = Math.sin(rad(G.theta));
const COS = Math.cos(rad(G.theta));
const BODY_TOP = G.cardH * COS + G.tuck;
const BODY_H = G.bodyW * G.bodyAspect;

/** Chimney placement on the right roof slope, and the bits' unit length. */
function chimneyGeometry(): { x0: number; cw: number; top: number; bottom: number; u: number } {
  const cw = G.bodyW * 0.2;
  const x0 = G.cardH * SIN * 0.38;
  const slopeY = (x: number): number => (x * COS) / SIN;
  const top = slopeY(x0) - G.bodyW * 0.2;
  return { x0, cw, top, bottom: slopeY(x0 + cw) + 20, u: G.bodyW * G.bitScale };
}

/** The bounding box of the drawn mark (no padding), in mark units. */
export function markBounds(withChimney = true): Box {
  const halfRoof = Math.max(G.cardH * SIN + 2, G.bodyW / 2);
  const ch = chimneyGeometry();
  return {
    minX: -halfRoof,
    maxX: withChimney ? Math.max(halfRoof, ch.x0 + ch.cw / 2 + ch.u * 0.26) : halfRoof,
    minY: withChimney ? Math.min(0, ch.top - ch.u * 0.34) : 0,
    maxY: BODY_TOP + BODY_H,
  };
}

/** The chimney stack with bits rising out of it like smoke. */
function chimney(p: LogoPalette): string {
  const { x0, cw, top, bottom, u } = chimneyGeometry();
  const stack = `<rect x="${fmt(x0)}" y="${fmt(top)}" width="${fmt(cw)}" height="${fmt(bottom - top)}" rx="${fmt(cw * 0.22)}" fill="${p.stack}"/>`;
  const cx = x0 + cw / 2;
  const bits = CHIMNEY_BITS.map(([dx, dy, size, rot]) =>
    roundedSquare(cx + u * dx, top - u * dy, u * size, p.accent, rot),
  ).join('');
  return stack + bits;
}

/** The tile around `box`: square, centred on it, `pad` wide or sized for the safe zone. */
function tile(box: Box, pad: number, safeZone: boolean): { x: number; y: number; size: number } {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const size = safeZone ? Math.hypot(w, h) / (2 * SAFE_ZONE_RADIUS) : Math.max(w, h) + 2 * pad;
  return {
    x: (box.minX + box.maxX) / 2 - size / 2,
    y: (box.minY + box.maxY) / 2 - size / 2,
    size,
  };
}

/** The Gobbit mark as a standalone square SVG document. */
export function logo(options: LogoOptions = {}): string {
  const {
    palette: p = MARK_PALETTE,
    chimney: withChimney = true,
    pad = 30,
    cornerRadius = 0,
    safeZone = false,
    px = 512,
  } = options;
  const s = SIN;
  const c = COS;
  const far = 2000;
  const k = G.apexR;

  // Roof: two cards leaning on each other, clipped to a rounded apex and split at the ridge.
  const card = (mirror: boolean): string =>
    `<g transform="${mirror ? 'scale(-1 1) ' : ''}rotate(${G.theta})"><rect width="${G.cardW}" height="${G.cardH}" rx="${G.cardR}"/></g>`;
  const defs =
    `<defs><clipPath id="roof"><path d="M${fmt(-far * s)} ${fmt(far * c)} L${fmt(-k * s)} ${fmt(k * c)} Q0 0 ${fmt(k * s)} ${fmt(k * c)} L${fmt(far * s)} ${fmt(far * c)} Z"/></clipPath>` +
    `<clipPath id="hl"><rect x="${-far}" y="${-far}" width="${far - G.ridge / 2}" height="${2 * far}"/></clipPath>` +
    `<clipPath id="hr"><rect x="${G.ridge / 2}" y="${-far}" width="${far}" height="${2 * far}"/></clipPath></defs>`;
  const roof = `<g clip-path="url(#roof)"><g clip-path="url(#hl)" fill="${p.left}">${card(false)}</g><g clip-path="url(#hr)" fill="${p.right}">${card(true)}</g></g>`;

  // Body: the upright card, outlined in the background colour so it separates from the roof.
  const body = `<rect x="${-G.bodyW / 2}" y="${fmt(BODY_TOP)}" width="${G.bodyW}" height="${fmt(BODY_H)}" rx="${G.cardR + 4}" fill="${p.body}" stroke="${p.bg}" stroke-width="${G.gap}" paint-order="stroke"/>`;
  const letter = brandG(0, BODY_TOP + BODY_H / 2, BODY_H * G.letterScale, p.mark, p.accent);

  const t = tile(markBounds(withChimney), pad, safeZone);
  const rx = cornerRadius > 0 ? ` rx="${fmt(t.size * cornerRadius)}"` : '';
  const bg = `<rect x="${fmt(t.x)}" y="${fmt(t.y)}" width="${fmt(t.size)}" height="${fmt(t.size)}"${rx} fill="${p.bg}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(t.x)} ${fmt(t.y)} ${fmt(t.size)} ${fmt(t.size)}" width="${px}" height="${px}">${defs}${bg}${withChimney ? chimney(p) : ''}${roof}${body}${letter}</svg>`;
}
