import { describe, expect, it } from 'vitest';
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
