import { RICH_TEXT_FIXTURES } from '@gobbit/shared/rich-text/fixtures';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TextCard } from '../../cards/TextCard';
import { roundTrip, withRichEditor } from './test-editor';

const trim = (s: string) => s.replace(/\n+$/, '');

describe('rich editor Markdown round-trip (D286, contract §5)', () => {
  it.each([
    ['plain text', 'Hello world'],
    ['line breaks as plain newlines (FR-010)', 'Milk\nEggs\nBread'],
    ['paragraphs', 'One\n\nTwo'],
    ['underline', 'A :u[word] here'],
    ['sizes', ':small[fine print] and :large[headline]'],
    ['colour', 'Allergy: :color[nuts]{.red}'],
    ['nested styles', ':large[:color[big red]{.red}]'],
    ['bold around styles (schema mark order)', '**:large[:color[big red]{.red}]**'],
    ['Hebrew with a colon', 'שעה: עשר'],
    ['a directive-looking colon stays escaped', 'Re\\:Plan'],
    ['bold and italic', '**bold** and *em*'],
    ['headings', '# One\n\n## Two\n\n### Three\n\n#### Four'],
    ['lists', '- a\n- b\n\n1. one\n2. two'],
    ['quote', '> quoted'],
    ['code', '`x` and\n\n```\nblock\n```'],
    ['link', '[text](https://example.com)'],
    ['time and label-less colons', 'Meet at 10:30'],
  ])('%s', async (_name, body) => {
    expect(trim(await roundTrip(body))).toBe(body);
  });

  it('turns unknown directives into their label (FR-005)', async () => {
    expect(trim(await roundTrip('A :huge[hot] day'))).toBe('A hot day');
  });

  it('drops an invalid colour but keeps its text', async () => {
    expect(trim(await roundTrip(':color[x]{.pink}'))).toBe('x');
  });

  it('keeps a size inside a heading out (contract §3)', async () => {
    expect(trim(await roundTrip('# A :large[b]'))).toBe('# A b');
  });
});

describe('paste (FR-011)', () => {
  const pasted = (html: string): Promise<string> =>
    withRichEditor('', (editor) => {
      // jsdom has no ClipboardEvent; ProseMirror only needs an event to mark the paste.
      editor.view.pasteHTML(html, new Event('paste') as ClipboardEvent);
      return editor.markdown();
    });

  it('keeps supported styles and drops the rest', async () => {
    expect(
      await pasted('<p><b>Strong</b> <span style="font-family: Papyrus">plain</span></p>'),
    ).toBe('**Strong** plain');
  });

  it('turns a pasted image into its alt text', async () => {
    expect(
      await pasted('<p>See <img src="https://example.com/x.png" alt="the map"> here</p>'),
    ).toBe('See the map here');
  });

  it('drops an image with no alt text', async () => {
    expect(await pasted('<p>A<img src="https://example.com/x.png">B</p>')).toBe('AB');
  });
});

describe('shared fixtures survive the editor (SC-002)', () => {
  /**
   * Each text run with the set of elements and classes around it: what the reader sees, not the
   * nesting order (bold may be written outside a style directive, see implementation notes).
   */
  const looks = (body: string): string[] => {
    const root = document.createElement('div');
    root.innerHTML = renderToStaticMarkup(createElement(TextCard, { body }));
    const runs: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const around: string[] = [];
      for (let el = node.parentElement; el && el !== root; el = el.parentElement)
        around.push([el.tagName.toLowerCase(), ...el.classList].join('.'));
      runs.push(`${node.textContent} <${around.sort().join(' ')}>`);
    }
    return runs;
  };

  // The editor may rewrite how Markdown is written (FR-013) but never how it renders.
  it.each(RICH_TEXT_FIXTURES)('$name', async ({ body }) => {
    expect(looks(await roundTrip(body))).toEqual(looks(body));
  });
});
