import { describe, expect, it } from 'vitest';
import { landingPage, type LandingState, type LandingView } from './landing';
import { LANDING_COPY_EN } from './landing-copy';

const ORIGIN = 'https://app.example.test';
const page = (view: Omit<LandingView, 'origin'>) => landingPage({ ...view, origin: ORIGIN });

function meta(html: string, property: string): string | undefined {
  const re = new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)">`);
  return re.exec(html)?.[1];
}

const ALL_STATES: LandingState[] = [
  'default',
  'joined',
  'confirmed',
  'confirm-invalid',
  'invalid',
  'signed-in',
];

describe('landingPage states (D226, D228)', () => {
  it.each([
    ['joined', LANDING_COPY_EN.states.joined.heading],
    ['confirmed', LANDING_COPY_EN.states.confirmed.heading],
    ['confirm-invalid', LANDING_COPY_EN.states.confirmInvalid.heading],
    ['signed-in', LANDING_COPY_EN.states.signedIn.body],
  ] as const)('%s renders its status message', (state, text) => {
    const html = page({ state });
    expect(html).toContain('role="status"');
    expect(html).toContain(text.replace("'", '&#39;'));
  });

  it('the default page has the hero, three uses, the form and the privacy line, no status', () => {
    const html = page({ state: 'default' });
    const { before, term, after } = LANDING_COPY_EN.hero.heading;
    expect(html).toMatch(
      new RegExp(`<h1>${before}<span class="term">.*>${term}</dfn>.*</span>${after}</h1>`, 's'),
    );
    for (const use of LANDING_COPY_EN.uses) expect(html).toContain(use.title);
    expect(html).toContain('<form class="join" method="post" action="/welcome">');
    expect(html).toContain(LANDING_COPY_EN.privacy);
    // 035 FR-012 / D281: opt-in, linked to the account, the Analytics button; not DNT.
    expect(LANDING_COPY_EN.privacy).toMatch(
      /With your permission.*linked to your account.*Analytics/s,
    );
    expect(LANDING_COPY_EN.privacy).not.toMatch(/do not track/i);
    expect(html).not.toContain('role="status"');
  });

  it('shows the form only where a visitor can join', () => {
    const withForm = ALL_STATES.filter((state) => page({ state }).includes('<form'));
    expect(withForm).toEqual(['default', 'confirm-invalid', 'invalid']);
  });

  it('links to sign-in, or to the app when signed in', () => {
    expect(page({ state: 'default' })).toContain('<a href="/sign-in">Sign in</a>');
    const signedIn = page({ state: 'signed-in' });
    expect(signedIn).toContain('<a href="/">Open Gobbit</a>');
    expect(signedIn).not.toContain('/sign-in');
  });

  it('has no script in any state', () => {
    for (const state of ALL_STATES) expect(page({ state })).not.toMatch(/<script/i);
  });

  it('keeps the default page under 30 KB', () => {
    expect(Buffer.byteLength(page({ state: 'default' }), 'utf8')).toBeLessThan(30 * 1024);
  });
});

describe('landingPage form (D228, D230)', () => {
  it('labels every field, groups the radios and hides the honeypot off-screen', () => {
    const html = page({ state: 'default' });
    expect(html).toMatch(/<label class="field">Email\s*<input type="email" name="email"/);
    expect(html).toContain('<fieldset>');
    expect(html).toContain(`<legend>${LANDING_COPY_EN.form.kind}</legend>`);
    expect(html.match(/type="radio" name="kind"/g)).toHaveLength(4);
    expect(html).toContain('maxlength="500"');
    expect(html).toMatch(/<div class="hp" aria-hidden="true">.*name="website" tabindex="-1"/);
  });

  it('carries a valid utm tag in a hidden field', () => {
    expect(page({ state: 'default', form: { utmSource: 'whatsapp' } })).toContain(
      '<input type="hidden" name="utm_source" value="whatsapp">',
    );
    expect(page({ state: 'default' })).not.toContain('utm_source');
  });

  it('re-fills typed values escaped and links each message to its field', () => {
    const html = page({
      state: 'invalid',
      form: { email: 'x"><b>', kind: 'community', note: '<b>hi</b>' },
      errors: { email: LANDING_COPY_EN.errors.email, kind: LANDING_COPY_EN.errors.kind },
    });
    expect(html).not.toContain('<b>');
    expect(html).toContain('value="x&quot;&gt;&lt;b&gt;"');
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;</textarea>');
    expect(html).toContain('value="community" required checked');
    expect(html).toContain('aria-invalid="true" aria-describedby="email-error"');
    expect(html).toContain('<p class="error" id="email-error">Enter a valid email address.</p>');
    expect(html).toContain('<fieldset aria-invalid="true" aria-describedby="kind-error">');
    expect(html).not.toContain('note-error');
    expect(html).toContain('role="alert"');
  });

  it('shows a page-level notice (the 429 retry message)', () => {
    const notice = LANDING_COPY_EN.errors.tooManyTries(12);
    expect(page({ state: 'invalid', notice })).toContain(
      `<p class="notice" role="alert">${notice}</p>`,
    );
  });
});

describe('landingPage head (D229)', () => {
  it.each(ALL_STATES)('%s: preview tags point at the root and the static image', (state) => {
    const html = page({ state });
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/">`);
    expect(meta(html, 'og:url')).toBe(`${ORIGIN}/`);
    expect(meta(html, 'og:title')).toBe(LANDING_COPY_EN.title);
    expect(meta(html, 'og:image')).toBe(`${ORIGIN}/og/landing.png`);
    expect(meta(html, 'og:image:width')).toBe('1200');
    expect(meta(html, 'og:image:height')).toBe('630');
    expect(meta(html, 'og:type')).toBe('website');
    expect(meta(html, 'twitter:card')).toBe('summary_large_image');
  });

  it('the description fits in 160 characters', () => {
    expect([...LANDING_COPY_EN.description].length).toBeLessThanOrEqual(160);
    expect(meta(page({ state: 'default' }), 'description')).toBe(LANDING_COPY_EN.description);
  });

  it('only the thanks page and the re-rendered form are noindex', () => {
    const noindex = ALL_STATES.filter((state) => meta(page({ state }), 'robots') === 'noindex');
    expect(noindex).toEqual(['joined', 'invalid']);
  });
});

describe('analytics tag and consent banner (D232, D264)', () => {
  const analytics = { siteId: '2f1c7a52-8f0e-4c3e-9b8a-0d6f2c4e1a90', host: 'app.example.test' };

  it.each(ALL_STATES)('%s carries page.js in <head> when configured', (state) => {
    const html = page({ state, analytics });
    const tag = html.indexOf('<script defer src="/analytics/page.js"');
    expect(tag).toBeGreaterThan(-1);
    expect(tag).toBeLessThan(html.indexOf('</head>'));
    expect(html).toContain(`data-website-id="${analytics.siteId}"`);
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).not.toContain('/stats/script.js');
  });

  it.each(ALL_STATES)('%s renders the closed consent dialog and the Analytics button', (state) => {
    const html = page({ state, analytics });
    expect(html).toMatch(/<dialog class="consent" data-consent-banner[^>]*>/);
    const footer = html.slice(html.lastIndexOf('<footer>'));
    expect(footer).toContain('data-consent-open hidden>Analytics</button>');
  });

  it.each(ALL_STATES)('%s has no tag, banner or button when unset', (state) => {
    const html = page({ state });
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain('/stats/');
    expect(html).not.toContain('data-consent');
  });
});
