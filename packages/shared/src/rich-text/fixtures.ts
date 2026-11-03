/**
 * Body fixtures shared by the reader and public-page renderer tests (SC-002, SC-004). Bodies that
 * existed before 038 (no breaks, no directives) must keep rendering as they did.
 */
export const RICH_TEXT_FIXTURES: readonly { name: string; body: string }[] = [
  { name: 'plain paragraph', body: 'Just a sentence.' },
  { name: 'line breaks', body: 'Milk\nEggs\nBread' },
  { name: 'paragraphs', body: 'One\n\nTwo' },
  { name: 'emphasis', body: '**bold** and *italic* and `code`' },
  { name: 'heading + list', body: '## Steps\n\n1. First\n2. Second\n\n- a\n- b' },
  { name: 'quote', body: '> quoted\n> still' },
  { name: 'code block', body: '```\nline 1\nline 2\n```' },
  { name: 'link', body: '[Gobbit](https://example.com/a)' },
  { name: 'underline', body: 'An :u[underlined] word' },
  { name: 'sizes', body: ':small[fine print] and :large[headline]' },
  { name: 'colour', body: 'Danger: :color[hot]{.red}' },
  { name: 'nested styles', body: ':large[:color[**x**]{.blue}]' },
  { name: 'unknown colour', body: ':color[hot]{.pink}' },
  { name: 'unknown directive', body: ':huge[hot]' },
  { name: 'label-less prose', body: 'Re:Plan at 10:30' },
  { name: 'size in heading', body: '## :small[quiet] title' },
  { name: 'leaf directive', body: '::leaf[x]' },
  { name: 'container directive', body: ':::box\ninside\n:::' },
];
