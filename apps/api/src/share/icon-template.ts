import { OG_COLORS, OG_TEMPLATE_FONT, type OgNode } from './og-template';

/** Placeholder monogram until a real logo exists (plan § 10). */
export const ICON_MONOGRAM = 'G';

/** A warm accent gradient shared by every icon variant. */
const ICON_GRADIENT = `linear-gradient(135deg, #d0703f 0%, ${OG_COLORS.accent} 100%)`;

export type IconVariant = 'any' | 'maskable';

/**
 * The app icon as a satori tree. `any` is a rounded tile on a transparent canvas; `maskable`
 * is full-bleed with the glyph kept inside the 80% safe zone, since launchers crop it.
 */
export function iconTree(size: number, variant: IconVariant = 'any'): OgNode {
  const maskable = variant === 'maskable';
  return {
    type: 'div',
    props: {
      style: {
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage: ICON_GRADIENT,
        borderRadius: maskable ? 0 : Math.round(size * 0.22),
        color: OG_COLORS.background,
        fontFamily: OG_TEMPLATE_FONT,
        fontWeight: 700,
        fontSize: Math.round(size * (maskable ? 0.5 : 0.62)),
        lineHeight: 1,
      },
      children: ICON_MONOGRAM,
    },
  };
}

/** The PNG icons referenced by the web manifest and index.html (paths under `public/`). */
export const STATIC_ICONS: { file: string; size: number; variant: IconVariant }[] = [
  { file: 'icons/icon-192.png', size: 192, variant: 'any' },
  { file: 'icons/icon-512.png', size: 512, variant: 'any' },
  { file: 'icons/icon-maskable-512.png', size: 512, variant: 'maskable' },
];
