/**
 * D321: the brand G — one rounded stroke traced around a card (not a circle, so it doesn't read
 * as a geometric-sans G) with a yellow "bit", the same rounded square that rises from the
 * chimney, sitting in its mouth as the bar. Drawn as paths, so no font is needed.
 */
import { fmt } from './svg';

/** Width / height, matching the body card the G sits on. */
const ASPECT = 0.92;
/** Stroke width / height. */
const STROKE = 0.2;
/** The bit's tilt, in degrees. */
const BIT_TILT = 14;

/** SVG `<g>` for the brand G centred on (cx, cy), `height` tall including the stroke. */
export function brandG(
  cx: number,
  cy: number,
  height: number,
  fill: string,
  accent: string,
): string {
  const sw = height * STROKE;
  const a = (height * ASPECT - sw) / 2;
  const b = (height - sw) / 2;
  const r = Math.min(a, b) * 0.62;
  const barY = b * 0.08;
  const arc = (x: number, y: number): string => `A${fmt(r)} ${fmt(r)} 0 0 0 ${fmt(x)} ${fmt(y)}`;
  const outline = [
    `M${fmt(a - r * 0.55)} ${fmt(-b)}`,
    `L${fmt(-a + r)} ${fmt(-b)}`,
    arc(-a, -b + r),
    `L${fmt(-a)} ${fmt(b - r)}`,
    arc(-a + r, b),
    `L${fmt(a - r)} ${fmt(b)}`,
    arc(a, b - r),
    `L${fmt(a)} ${fmt(barY)}`,
  ].join(' ');
  const stroke = `<path d="${outline}" fill="none" stroke="${fill}" stroke-width="${fmt(sw)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  // Nudged left of centre so the bit never touches the right stem.
  const bit = roundedSquare(-a * 0.04, barY, sw * 1.25, accent, BIT_TILT);
  return `<g transform="translate(${fmt(cx)} ${fmt(cy)})">${stroke}${bit}</g>`;
}

/** A rounded-square "bit" centred on (x, y), rotated by `rot` degrees. */
export function roundedSquare(x: number, y: number, size: number, fill: string, rot = 0): string {
  return `<rect x="${fmt(x - size / 2)}" y="${fmt(y - size / 2)}" width="${fmt(size)}" height="${fmt(size)}" rx="${fmt(size * 0.28)}" fill="${fill}" transform="rotate(${rot} ${fmt(x)} ${fmt(y)})"/>`;
}
