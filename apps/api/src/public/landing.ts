import { WAITLIST_NOTE_MAX } from '@pb/shared';
import { LANDING_OG_IMAGE_PATH, OG_HEIGHT, OG_WIDTH } from '../share/og-template';
import { h, type Html } from './html';
import { LANDING_COPY_EN, type LandingCopy } from './landing-copy';
import type { LandingField, LandingFormErrors, LandingFormValues } from './landing-form';
import { LANDING_CSS } from './landing-styles';
import { layout, type PageHead } from './layout';
import { LANDING_PATH, landingUrl } from './public-url';

/** D226–D230: the page's states, chosen by the route (data-model § Page states). */
export type LandingState =
  'default' | 'joined' | 'confirmed' | 'confirm-invalid' | 'invalid' | 'signed-in';

export type LandingView = {
  state: LandingState;
  /** APP_URL origin (no trailing slash), for canonical, og:url and og:image. */
  origin: string;
  /** Values to re-fill (`invalid`) or the hidden utm tag. */
  form?: Partial<LandingFormValues>;
  errors?: LandingFormErrors;
  /** A page-level message above the form, e.g. the 429 retry notice. */
  notice?: string;
  copy?: LandingCopy;
};

/** States whose page should not be indexed (D229): the thanks page and the 400/429 re-render. */
const NOINDEX_STATES: ReadonlySet<LandingState> = new Set(['joined', 'invalid']);
const FORM_STATES: ReadonlySet<LandingState> = new Set(['default', 'confirm-invalid', 'invalid']);

const errorId = (name: LandingField) => `${name}-error`;

function head(view: LandingView, copy: LandingCopy): PageHead {
  return {
    title: copy.title,
    description: copy.description,
    canonical: landingUrl(view.origin),
    image: `${view.origin}${LANDING_OG_IMAGE_PATH}`,
    imageSize: { width: OG_WIDTH, height: OG_HEIGHT },
    ogType: 'website',
    locale: copy.locale,
    lang: copy.lang,
    dir: copy.dir,
    robots: NOINDEX_STATES.has(view.state) ? 'noindex' : 'index',
  };
}

function headerLink(view: LandingView, copy: LandingCopy): Html {
  return view.state === 'signed-in'
    ? h`<a href="/">${copy.header.openApp}</a>`
    : h`<a href="/sign-in">${copy.header.signIn}</a>`;
}

function status(heading: string, body: string): Html {
  return h`<section class="status" role="status"><h2>${heading}</h2><p>${body}</p></section>`;
}

function stateMessage(view: LandingView, copy: LandingCopy): Html | '' {
  switch (view.state) {
    case 'joined':
      return status(copy.states.joined.heading, copy.states.joined.body);
    case 'confirmed':
      return status(copy.states.confirmed.heading, copy.states.confirmed.body);
    case 'confirm-invalid':
      return status(copy.states.confirmInvalid.heading, copy.states.confirmInvalid.body);
    case 'signed-in':
      return h`<section class="status" role="status"><p>${copy.states.signedIn.body}</p><p><a class="button" href="/">${copy.header.openApp}</a></p></section>`;
    default:
      return '';
  }
}

function fieldError(errors: LandingFormErrors, name: LandingField): Html | '' {
  const message = errors[name];
  return message ? h`<p class="error" id="${errorId(name)}">${message}</p>` : '';
}

/** `aria-invalid` + `aria-describedby` on a field that has a message. */
function invalidAttrs(errors: LandingFormErrors, name: LandingField): Html | '' {
  return errors[name] ? h` aria-invalid="true" aria-describedby="${errorId(name)}"` : '';
}

function joinForm(view: LandingView, copy: LandingCopy): Html {
  const values = view.form ?? {};
  const errors = view.errors ?? {};
  const hasErrors = Object.keys(errors).length > 0;
  const kinds = Object.entries(copy.kinds).map(
    ([value, label]) =>
      h`<label class="choice"><input type="radio" name="kind" value="${value}" required${values.kind === value ? h` checked` : ''}> ${label}</label>`,
  );
  return h`<form class="join" method="post" action="${LANDING_PATH}">
<h2 id="join">${copy.form.heading}</h2>
${view.notice ? h`<p class="notice" role="alert">${view.notice}</p>` : ''}
${hasErrors ? h`<p class="notice" role="alert">${copy.errors.formHeading}</p>` : ''}
<label class="field">${copy.form.email}
<input type="email" name="email" autocomplete="email" inputmode="email" required value="${values.email ?? ''}"${invalidAttrs(errors, 'email')}>
${fieldError(errors, 'email')}
</label>
<fieldset${invalidAttrs(errors, 'kind')}>
<legend>${copy.form.kind}</legend>
${kinds}
${fieldError(errors, 'kind')}
</fieldset>
<label class="field">${copy.form.note}
<textarea name="note" maxlength="${WAITLIST_NOTE_MAX}" rows="3"${invalidAttrs(errors, 'note')}>${values.note ?? ''}</textarea>
${fieldError(errors, 'note')}
</label>
${values.utmSource ? h`<input type="hidden" name="utm_source" value="${values.utmSource}">` : ''}
<div class="hp" aria-hidden="true"><label>${copy.form.honeypot} <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
<button type="submit">${copy.form.submit}</button>
</form>`;
}

/**
 * D226–D230: the landing page. One template for every state; no script; every value (typed
 * email and note included) escaped by `h`. Canonical and og:url are the root in every state.
 */
export function landingPage(view: LandingView): string {
  const copy = view.copy ?? LANDING_COPY_EN;
  const uses = copy.uses.map((use) => h`<li><h2>${use.title}</h2><p>${use.body}</p></li>`);
  const main = h`<section class="hero">
<h1>${copy.hero.heading}</h1>
<p>${copy.hero.lead}</p>
${view.state === 'signed-in' ? '' : h`<p>${copy.hero.invite}</p>`}
</section>
${stateMessage(view, copy)}
<ul class="uses">${uses}</ul>
${FORM_STATES.has(view.state) ? joinForm(view, copy) : ''}
<footer><p>${copy.privacy}</p><p>${copy.footer}</p></footer>`;
  return layout(head(view, copy), main, { css: LANDING_CSS, headerLink: headerLink(view, copy) });
}
