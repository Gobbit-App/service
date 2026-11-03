import { ANALYTICS_BANNER } from '@gobbit/shared/analytics';
import { h, type Html } from './html';

/**
 * D264 (contract §4): the visitor banner on API-rendered pages. Rendered `hidden`; only the
 * first-party `/analytics/page.js` reveals it (so with scripts off nothing appears, US3.4). The
 * "current choice" templates ride as data attributes so the copy stays here, escaped.
 */
export function consentBanner(): Html {
  return h`<section class="consent" data-consent-banner aria-label="${ANALYTICS_BANNER.label}" hidden>
<p>${ANALYTICS_BANNER.text}</p>
<p class="muted" data-consent-current data-allowed="${ANALYTICS_BANNER.currentAllowed}" data-declined="${ANALYTICS_BANNER.currentDeclined}" hidden></p>
<div class="consent-actions">
<button type="button" data-consent-choice="allowed">${ANALYTICS_BANNER.allow}</button>
<button type="button" data-consent-choice="declined">${ANALYTICS_BANNER.decline}</button>
</div>
</section>`;
}

/** D264: the "Analytics" control that reopens the banner (landing privacy note, `/p` footer). */
export function consentOpenButton(): Html {
  return h`<button type="button" class="consent-open" data-consent-open hidden>${ANALYTICS_BANNER.reopen}</button>`;
}

/** Banner styles; in the document flow, never fixed (D264). */
export const CONSENT_CSS = `
.consent{border:1px solid var(--line);border-radius:.75rem;background:var(--card);padding:.75rem 1rem;margin-block-end:1.25rem;font-size:.9rem}
.consent p{margin:0 0 .5rem}
.consent-actions{display:flex;flex-wrap:wrap;gap:.5rem}
.consent button,.consent-open{font:inherit;padding:.3rem .8rem;border:1px solid var(--accent);border-radius:.5rem;background:transparent;color:var(--accent);cursor:pointer}
.consent button[data-consent-choice="allowed"]{background:var(--accent);color:var(--bg)}
.consent-open{padding:.1rem .6rem;font-size:.85rem}
[hidden]{display:none!important}
`
  .trim()
  .replace(/\n/g, '');
