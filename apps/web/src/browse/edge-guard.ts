/** D140: starts this close to a side edge belong to the system back gesture. */
export const EDGE_GUARD_PX = 24;

/**
 * True when a pointer-down at `x` is within `guard` px of the left or right viewport edge:
 * 0–23 px on the left, the last 24 px on the right. Such starts are never handled as swipes.
 */
export function isEdgeStart(x: number, viewportWidth: number, guard = EDGE_GUARD_PX): boolean {
  return x < guard || x >= viewportWidth - guard;
}
