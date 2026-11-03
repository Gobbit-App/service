import { ANALYTICS_BANNER } from '@gobbit/shared/analytics';
import { h, type Html } from './html';

/**
 * D264, a wall since D281: the visitor choice on API-rendered pages, a closed `<dialog>`. Only the
 * first-party `/analytics/page.js` opens it as a modal until the visitor answers (with scripts
 * off nothing appears and nothing is sent, US3.4). Both answers carry the same weight. The
 * "current choice" templates ride as data attributes so the copy stays here, escaped.
 */
export function consentBanner(): Html {
  return h`<dialog class="consent" data-consent-banner aria-label="${ANALYTICS_BANNER.label}" aria-describedby="consent-text">
<h2>${ANALYTICS_BANNER.title}</h2>
<p id="consent-text">${ANALYTICS_BANNER.text}</p>
<p class="muted" data-consent-current data-allowed="${ANALYTICS_BANNER.currentAllowed}" data-declined="${ANALYTICS_BANNER.currentDeclined}" hidden></p>
<div class="consent-actions">
<button type="button" data-consent-choice="allowed">${ANALYTICS_BANNER.allow}</button>
<button type="button" data-consent-choice="declined">${ANALYTICS_BANNER.decline}</button>
</div>
</dialog>`;
}

/** D264: the "Analytics" control that reopens the banner (landing privacy note, `/p` footer). */
export function consentOpenButton(): Html {
  return h`<button type="button" class="consent-open" data-consent-open hidden>${ANALYTICS_BANNER.reopen}</button>`;
}

/** Dialog styles; both answers look the same (D281). */
export const CONSENT_CSS = `
.consent{max-width:min(28rem,calc(100vw - 2rem));border:1px solid var(--line);border-radius:.75rem;background:var(--card);color:inherit;padding:1rem 1.25rem;font-size:.95rem}
.consent::backdrop{background:rgb(0 0 0 / .6)}
.consent h2{margin:0 0 .5rem;font-size:1.1rem}
.consent p{margin:0 0 .75rem}
.consent-actions{display:flex;flex-wrap:wrap;gap:.5rem}
.consent button,.consent-open{font:inherit;padding:.4rem 1rem;border:1px solid var(--accent);border-radius:.5rem;background:transparent;color:var(--accent);cursor:pointer}
.consent-open{padding:.1rem .6rem;font-size:.85rem}
[hidden]{display:none!important}
`
  .trim()
  .replace(/\n/g, '');
