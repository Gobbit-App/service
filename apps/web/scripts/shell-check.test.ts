import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STATS_BASE_PATH } from '../../api/src/public/analytics';
import { shellTrackerViolations, STATS_PREFIX } from './shell-check';

describe('shellTrackerViolations (D232)', () => {
  it('uses the API tag prefix', () => {
    expect(STATS_PREFIX).toBe(`${STATS_BASE_PATH}/`);
  });

  it('flags a tracker in the shell', () => {
    const html = '<head>\n<script defer src="/stats/script.js"></script>\n</head>';
    expect(shellTrackerViolations(html)).toEqual([
      'references /stats/: <script defer src="/stats/script.js"></script>',
    ]);
  });

  it('the source index.html has no tracker', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(shellTrackerViolations(html)).toEqual([]);
  });
});
