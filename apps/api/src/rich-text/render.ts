import {
  RICH_TEXT_CLASSES,
  remarkNormalizeStyles,
  remarkStylesToHast,
} from '@gobbit/shared/rich-text';
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkBreaks from 'remark-breaks';
import remarkDirective from 'remark-directive';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

/**
 * D285: sanitizer schema — the default (GitHub-style) allow-list plus `<u>` and `span`s that carry
 * only the rich-text classes. Raw HTML never reaches it: remark-rehype drops `html` nodes.
 */
const schema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'u', 'span'],
  attributes: {
    ...defaultSchema.attributes,
    span: [['className', ...RICH_TEXT_CLASSES]],
  },
};

const processor = unified()
  .use(remarkParse)
  .use(remarkBreaks)
  .use(remarkDirective)
  .use(remarkNormalizeStyles)
  .use(remarkStylesToHast)
  .use(remarkRehype)
  .use(rehypeSanitize, schema)
  .use(rehypeStringify)
  .freeze();

/**
 * Card body Markdown → safe HTML, the same grammar the reader uses (contract body-markdown.md).
 * Raw HTML is dropped; unsafe link protocols lose their `href`.
 */
export function renderBodyHtml(body: string): string {
  return String(processor.processSync(body));
}
