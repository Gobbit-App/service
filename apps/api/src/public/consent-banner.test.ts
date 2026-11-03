import { describe, expect, it } from 'vitest';
import { ANALYTICS_BANNER } from '@gobbit/shared/analytics';
import { CONSENT_CSS, consentBanner, consentOpenButton } from './consent-banner';

describe('consentBanner (D264, D281)', () => {
  const html = consentBanner().toString();

  it('is a closed, labelled dialog with both choices', () => {
    expect(html).toMatch(/^<dialog class="consent" data-consent-banner aria-label="[^"]+"/);
    expect(html).not.toMatch(/^<dialog[^>]*\sopen/);
    expect(html).toContain(`<h2>${ANALYTICS_BANNER.title}</h2>`);
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
  it('dims the page behind the dialog', () => {
    expect(CONSENT_CSS).toContain('.consent::backdrop');
  });

  it('gives both answers the same look (D281)', () => {
    expect(CONSENT_CSS).not.toContain('data-consent-choice');
  });
});
