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

  it('the landing note says opt-in, no cookies, linked to the account and the Analytics button', () => {
    expect(ANALYTICS_PRIVACY_NOTE).toMatch(/^With your permission/);
    expect(ANALYTICS_PRIVACY_NOTE).toMatch(/without cookies/);
    expect(ANALYTICS_PRIVACY_NOTE).toMatch(/linked to your account/);
    expect(ANALYTICS_PRIVACY_NOTE).toMatch(/Never your content, searches or email/);
    expect(ANALYTICS_PRIVACY_NOTE).toContain('“Analytics”');
  });

  it('the prompt and settings say what is measured, the account link, what never is (D281)', () => {
    for (const text of [ANALYTICS_PROMPT.text, ANALYTICS_SETTINGS.text]) {
      expect(text).toMatch(/linked to your account/);
      expect(text).toMatch(/Never your content, searches or email/);
    }
    expect(ANALYTICS_PROMPT.text).toMatch(/Settings → Privacy/);
    expect(ANALYTICS_SETTINGS.text).toMatch(/Off unless you allow it/);
    expect(ANALYTICS_SETTINGS.unanswered).toMatch(/\(off\)/);
  });

  it('never claims "nothing personal" or anonymity for members', () => {
    expect(ALL).not.toMatch(/nothing personal|anonymous/i);
  });

  it('both answers are short, neutral words', () => {
    for (const choice of [ANALYTICS_BANNER, ANALYTICS_PROMPT]) {
      expect(choice.allow).toBe('Allow');
      expect(choice.decline).toBe('No thanks');
    }
  });
});
