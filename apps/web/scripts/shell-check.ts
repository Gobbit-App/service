/** D232: the analytics proxy prefix; the app shell must never reference it (031). */
export const STATS_PREFIX = '/stats/';

/** Lines of `index.html` that mention the analytics proxy; empty when the shell is clean. */
export function shellTrackerViolations(html: string): string[] {
  return html
    .split('\n')
    .filter((line) => line.includes(STATS_PREFIX))
    .map((line) => `references ${STATS_PREFIX}: ${line.trim()}`);
}
