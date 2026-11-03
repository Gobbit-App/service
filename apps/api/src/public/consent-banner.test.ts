import { describe, expect, it } from 'vitest';
import { ANALYTICS_BANNER } from '@gobbit/shared/analytics';
import { CONSENT_CSS, consentBanner, consentOpenButton } from './consent-banner';

describe('consentBanner (D264)', () => {
  const html = consentBanner().toString();

  it('is a hidden, labelled region with both choices', () => {
    expect(html).toMatch(
      /^<section class="consent" data-consent-banner aria-label="[^"]+" hidden>/,
    );
    expect(html).toContain(`aria-label="${ANALYTICS_BANNER.label}"`);
    expect(html).toContain('data-consent-choice="allowed"');
    expect(html).toContain('data-consent-choice="declined"');
  });

  it('carries the current-choice templates hidden', () => {
    expect(html).toMatch(/<p class="muted" data-consent-current [^>]*hidden><\/p>/);
  });

  it('has no inline script or handler (CSP)', () => {
    expect(html).not.toMatch(/<script|\son[a-z]+=/i);
  });
});

describe('consentOpenButton', () => {
  it('is hidden until page.js reveals it', () => {
    expect(consentOpenButton().toString()).toBe(
      `<button type="button" class="consent-open" data-consent-open hidden>${ANALYTICS_BANNER.reopen}</button>`,
    );
  });
});

describe('CONSENT_CSS', () => {
  it('never fixes the banner over the page', () => {
    expect(CONSENT_CSS).not.toMatch(/position:\s*(fixed|sticky)/);
  });
});
