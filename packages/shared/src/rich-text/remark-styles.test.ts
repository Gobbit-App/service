import type { Root } from 'mdast';
import remarkDirective from 'remark-directive';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { VFile } from 'vfile';
import { describe, expect, it } from 'vitest';
import { remarkNormalizeStyles, remarkStylesToHast, remarkUnwrapStyles } from './remark-styles';

function tree(body: string, ...plugins: (() => (tree: Root, file?: VFile) => void)[]): Root {
  const processor = unified().use(remarkParse).use(remarkDirective);
  const file = new VFile(body);
  const parsed = processor.parse(file);
  for (const plugin of plugins) plugin()(parsed, file);
  return parsed;
}

/** Compact shape: node types with text values, ignoring positions. */
function shape(node: unknown): unknown {
  const n = node as {
    type: string;
    value?: string;
    name?: string;
    children?: unknown[];
    data?: unknown;
  };
  if (n.value !== undefined) return `${n.type}:${n.value}`;
  const out: Record<string, unknown> = { type: n.type };
  if (n.name) out.name = n.name;
  if (n.data) out.data = n.data;
  if (n.children) out.children = n.children.map(shape);
  return out;
}

function paragraph(body: string, ...plugins: Parameters<typeof tree>[1][]): unknown {
  const root = tree(body, ...plugins);
  return (shape(root) as { children: unknown[] }).children[0];
}

describe('remarkNormalizeStyles', () => {
  it('keeps the four style directives', () => {
    const p = paragraph(':u[a] :small[b] :large[c] :color[d]{.red}', remarkNormalizeStyles) as {
      children: { type: string; name?: string }[];
    };
    const directives = p.children.filter((c) => c.type === 'textDirective').map((c) => c.name);
    expect(directives).toEqual(['u', 'small', 'large', 'color']);
  });

  it.each([':color[hot]{.pink}', ':color[hot]', ':color[hot]{.red .blue}', ':huge[hot]'])(
    'unwraps %s to its label',
    (body) => {
      expect(paragraph(body, remarkNormalizeStyles)).toEqual({
        type: 'paragraph',
        children: ['text:hot'],
      });
    },
  );

  it('restores label-less directives to their exact source', () => {
    const p = paragraph('Re:Plan at 10:30', remarkNormalizeStyles) as { children: string[] };
    expect(p.children.join('|').replaceAll('text:', '')).toBe('Re|:Plan| at 10|:30');
  });

  it('restores a label-less directive with attributes verbatim', () => {
    const p = paragraph('a:b{.c}', remarkNormalizeStyles) as { children: string[] };
    expect(p.children.map((c) => c.replace('text:', '')).join('')).toBe('a:b{.c}');
  });

  it('keeps nested styles and inline Markdown in labels', () => {
    const p = paragraph(':large[:color[**x**]{.blue}]', remarkNormalizeStyles);
    expect(p).toMatchObject({
      children: [
        {
          name: 'large',
          children: [{ name: 'color', children: [{ type: 'strong', children: ['text:x'] }] }],
        },
      ],
    });
  });

  it('unwraps sizes inside headings but keeps colour and underline', () => {
    const h = paragraph('## :small[quiet] :u[line] title', remarkNormalizeStyles) as {
      type: string;
      children: unknown[];
    };
    expect(h.type).toBe('heading');
    expect(h.children[0]).toBe('text:quiet');
    expect(h.children[2]).toMatchObject({ name: 'u' });
  });

  it('turns leaf directives into paragraphs and unwraps containers', () => {
    const root = shape(tree('::leaf[x]\n\n:::box\ninside\n:::', remarkNormalizeStyles)) as {
      children: unknown[];
    };
    expect(root.children).toEqual([
      { type: 'paragraph', children: ['text:x'] },
      { type: 'paragraph', children: ['text:inside'] },
    ]);
  });

  it('restores a label-less leaf directive to its source', () => {
    expect(paragraph('::leaf', remarkNormalizeStyles)).toEqual({
      type: 'paragraph',
      children: ['text:::leaf'],
    });
  });

  it('leaves an unclosed label as literal text', () => {
    const p = paragraph(':u[unclosed', remarkNormalizeStyles) as { children: string[] };
    expect(p.children.map((c) => c.replace('text:', '')).join('')).toBe(':u[unclosed');
  });

  it('falls back to the label when no source file is given', () => {
    const root = tree(':huge[hot]');
    remarkNormalizeStyles()(root);
    expect((shape(root) as { children: unknown[] }).children[0]).toEqual({
      type: 'paragraph',
      children: ['text:hot'],
    });
  });
});

describe('remarkStylesToHast', () => {
  const data = (body: string) =>
    (
      paragraph(body, remarkNormalizeStyles, remarkStylesToHast) as {
        children: { data?: unknown }[];
      }
    ).children[0]?.data;

  it('maps underline to <u>', () => {
    expect(data(':u[a]')).toEqual({ hName: 'u' });
  });

  it('maps sizes to rt-* spans', () => {
    expect(data(':small[a]')).toEqual({ hName: 'span', hProperties: { className: ['rt-small'] } });
    expect(data(':large[a]')).toEqual({ hName: 'span', hProperties: { className: ['rt-large'] } });
  });

  it('maps colours to rt-color spans', () => {
    expect(data(':color[a]{.green}')).toEqual({
      hName: 'span',
      hProperties: { className: ['rt-color', 'rt-color--green'] },
    });
  });
});

describe('remarkUnwrapStyles', () => {
  it('replaces style directives with their labels', () => {
    expect(paragraph('a :u[b] :large[:color[c]{.red}]', remarkUnwrapStyles)).toEqual({
      type: 'paragraph',
      children: ['text:a ', 'text:b', 'text: ', 'text:c'],
    });
  });
});
