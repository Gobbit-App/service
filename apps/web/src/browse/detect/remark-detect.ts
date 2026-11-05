import type { Parent, PhrasingContent, Root, Text } from 'mdast';
import { SKIP, visit } from 'unist-util-visit';
import { segmentText } from './segment';

/** Attribute names the renderer reads back (`Detected`). */
export const DETECT_ATTR = 'data-detect';
export const VALUE_ATTR = 'data-value';

/** Text inside these is already a link or is code: never marked (FR-025). */
const SKIPPED = new Set(['link', 'linkReference', 'code', 'inlineCode', 'html']);

/** A text node turned into a `<span data-detect data-value>` holding the text as written. */
function detectedNode(kind: string, text: string, value: string): PhrasingContent {
  return {
    type: 'emphasis',
    children: [{ type: 'text', value: text }],
    data: { hName: 'span', hProperties: { [DETECT_ATTR]: kind, [VALUE_ATTR]: value } },
  };
}

/**
 * D339/D340: marks emails, web addresses, phones and numbers in a card body for Browse. It
 * runs after the body plugins, changes only the rendered tree and never the stored text.
 * (The marked node is typed as `emphasis` for mdast; `hName` renders it as a plain span.)
 */
export function remarkDetect() {
  return (tree: Root) => {
    visit(tree, (node, index, parent: Parent | undefined) => {
      if (SKIPPED.has(node.type)) return SKIP;
      if (node.type !== 'text' || parent === undefined || index === undefined) return;
      const segments = segmentText((node as Text).value);
      if (!segments.some((segment) => segment.kind !== 'text')) return;
      const replacement = segments.map((segment): PhrasingContent =>
        segment.kind === 'text'
          ? { type: 'text', value: segment.text }
          : detectedNode(segment.kind, segment.text, segment.value),
      );
      parent.children.splice(index, 1, ...(replacement as Parent['children']));
      // Skip what was just inserted: the marked spans hold text that must not be visited again.
      return [SKIP, index + replacement.length];
    });
  };
}
