/** D307 (039): the counter appears from this share of the limit. */
export const SHOW_COUNT_FROM = 0.8;

/** Whether a limit counter is shown: from 80 % of the limit, and always when over it. */
export function shouldShowCount(used: number, max: number): boolean {
  return used > max || used >= max * SHOW_COUNT_FROM;
}
