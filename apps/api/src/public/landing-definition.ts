import { h, type Html } from './html';
import type { LandingCopy } from './landing-copy';

export const DEFINITION_ID = 'term-definition';

/**
 * The hero heading with its defined term. The page has no script, so the dictionary panel opens
 * on `:hover` and `:focus-within` (keyboard and tap focus the term). Everything is phrasing
 * content because it sits inside the `<h1>`. The panel is `aria-hidden` so it never joins the
 * heading's name; assistive tech reads it as the term's description instead. It comes before the
 * term so its block box can't put a space between the term and the punctuation after it.
 */
export function heroHeading(copy: LandingCopy): Html {
  const { heading, definition: def } = copy.hero;
  const senses = def.senses.map((sense) => h`<span class="sense">${sense}</span>`);
  const panel = h`<span class="definition" id="${DEFINITION_ID}" aria-hidden="true"><span class="entry"><span class="headword">${def.headword}</span> <span class="pron">${def.pronunciation}</span></span><span class="pos">${def.partOfSpeech} · ${def.plural}</span><span class="senses">${senses}</span><span class="example">${def.example}</span><span class="origin">${def.origin}</span></span>`;
  return h`<h1>${heading.before}<span class="term">${panel}<dfn tabindex="0" aria-describedby="${DEFINITION_ID}">${heading.term}</dfn></span>${heading.after}</h1>`;
}
