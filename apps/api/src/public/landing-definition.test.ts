import { describe, expect, it } from 'vitest';
import { LANDING_COPY_EN, type LandingCopy } from './landing-copy';
import { DEFINITION_ID, heroHeading } from './landing-definition';

const render = (copy: LandingCopy = LANDING_COPY_EN) => String(heroHeading(copy));

describe('heroHeading', () => {
  it('wraps the term in a focusable dfn described by the dictionary panel', () => {
    const html = render();
    expect(html).toContain(
      `<dfn tabindex="0" aria-describedby="${DEFINITION_ID}">${LANDING_COPY_EN.hero.heading.term}</dfn>`,
    );
    expect(html).toContain(`id="${DEFINITION_ID}" aria-hidden="true"`);
  });

  it('renders the whole entry: headword, pronunciation, part of speech, senses, example, origin', () => {
    const html = render();
    const def = LANDING_COPY_EN.hero.definition;
    expect(html).toContain(`<span class="headword">${def.headword}</span>`);
    expect(html).toContain(def.pronunciation);
    expect(html).toContain(def.partOfSpeech);
    for (const sense of def.senses) expect(html).toContain(`<span class="sense">${sense}</span>`);
    expect(html).toContain(def.example);
    expect(html).toContain(def.origin);
  });

  it('keeps to phrasing content inside the h1', () => {
    expect(render()).not.toMatch(/<(div|p|ol|ul|li|section)\b/);
  });

  it('escapes translated copy', () => {
    const { hero } = LANDING_COPY_EN;
    const copy = {
      ...LANDING_COPY_EN,
      hero: {
        ...hero,
        heading: { ...hero.heading, term: '<b>x</b>' },
        definition: { ...hero.definition, senses: ['<img src=x>'] },
      },
    } as unknown as LandingCopy;
    const html = render(copy);
    expect(html).not.toContain('<b>x</b>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
