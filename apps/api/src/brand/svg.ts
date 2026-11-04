/** Round to one decimal so generated SVG stays short and stable across runs. */
export const fmt = (n: number): number => Number(n.toFixed(1));

/** Degrees to radians. */
export const rad = (deg: number): number => (deg * Math.PI) / 180;
