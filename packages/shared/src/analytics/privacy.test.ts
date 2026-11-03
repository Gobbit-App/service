import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_BANNER,
  ANALYTICS_PRIVACY_NOTE,
  ANALYTICS_PROMPT,
  ANALYTICS_SETTINGS,
} from './privacy';

const ALL = [
  ANALYTICS_PRIVACY_NOTE,
  ...Object.values(ANALYTICS_BANNER),
  ...Object.values(ANALYTICS_PROMPT),
  ...Object.values(ANALYTICS_SETTINGS),
].join('\n');

describe('analytics copy (FR-012, D266)', () => {
  it('never presents Do Not Track as an off switch', () => {
    expect(ALL).not.toMatch(/do not track/i);
  });

  it('the landing note names anonymous counting, the banner choice and the Analytics button', () => {
    expect(ANALYTICS_PRIVACY_NOTE).toMatch(/without cookies/);
    expect(ANALYTICS_PRIVACY_NOTE).toContain('“No thanks”');
    expect(ANALYTICS_PRIVACY_NOTE).toContain('“Analytics”');
    expect(ANALYTICS_PRIVACY_NOTE).toMatch(/member id/);
  });

  it('the prompt and settings say what is measured, what never is and the default', () => {
    for (const text of [ANALYTICS_PROMPT.text, ANALYTICS_SETTINGS.text]) {
      expect(text).toMatch(/member id/);
      expect(text).toMatch(/never record/);
      expect(text).toMatch(/on unless/);
    }
    expect(ANALYTICS_PROMPT.text).toMatch(/Settings → Privacy/);
  });
});
