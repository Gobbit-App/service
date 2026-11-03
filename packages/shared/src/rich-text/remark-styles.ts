import type { Paragraph, Parent, PhrasingContent, Root, RootContent, Text } from 'mdast';
import type { ContainerDirective, LeafDirective, TextDirective } from 'mdast-util-directive';
import {
  COLOR,
  COLOR_CLASS,
  UNDERLINE,
  colorClass,
  isPaletteColor,
  isTextSize,
  sizeClass,
} from './constants';

/**
 * D284: two small mdast transforms over the tree `remark-directive` produced. Gobbit never parses
 * the syntax itself; these only decide which directive nodes are styles and how they map to HTML.
 */

type Directive = TextDirective | LeafDirective | ContainerDirective;
type SourceFile = { toString(): string } | undefined;

/** The colour a `:color[…]{.name}` directive names, or null when it isn't exactly one palette class. */
export function directiveColor(node: TextDirective): string | null {
  const classes = (node.attributes?.class ?? '').split(/\s+/).filter(Boolean);
  const [only] = classes;
  return classes.length === 1 && only && isPaletteColor(only) ? only : null;
}

function isStyle(node: TextDirective, inHeading: boolean): boolean {
  if (node.name === UNDERLINE) return true;
  if (isTextSize(node.name)) return !inHeading;
  if (node.name === COLOR) return directiveColor(node) !== null;
  return false;
}

/** The directive's exact source text, when the parser recorded offsets. */
function sourceOf(node: Directive, source: string | undefined): string | undefined {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return source !== undefined && start !== undefined && end !== undefined
    ? source.slice(start, end)
    : undefined;
}

/** `:name[…]` / `::name[…]`: written with a label (otherwise it was probably prose, e.g. `Re:Plan`). */
function hasLabel(node: Directive, raw: string | undefined): boolean {
  if (raw === undefined) return node.children.length > 0;
  const colons = node.type === 'textDirective' ? 1 : node.type === 'leafDirective' ? 2 : 3;
  return raw.startsWith(`${':'.repeat(colons)}${node.name}[`);
}

function text(value: string): Text {
  return { type: 'text', value };
}

/** What a non-style directive becomes: its label's content, or its own source as text. */
function replacement(node: Directive, source: string | undefined): RootContent[] {
  const raw = sourceOf(node, source);
  switch (node.type) {
    case 'textDirective':
      return hasLabel(node, raw) ? node.children : [text(raw ?? `:${node.name}`)];
    case 'leafDirective': {
      const children: PhrasingContent[] = hasLabel(node, raw)
        ? node.children
        : [text(raw ?? `::${node.name}`)];
      const paragraph: Paragraph = { type: 'paragraph', children };
      return [paragraph];
    }
    case 'containerDirective':
      return node.children;
  }
}

function isDirective(node: RootContent): node is Directive {
  return (
    node.type === 'textDirective' ||
    node.type === 'leafDirective' ||
    node.type === 'containerDirective'
  );
}

function normalizeChildren(parent: Parent, source: string | undefined, inHeading: boolean): void {
  const next: RootContent[] = [];
  for (const child of parent.children) {
    const childInHeading = inHeading || child.type === 'heading';
    if ('children' in child) normalizeChildren(child as Parent, source, childInHeading);
    if (!isDirective(child)) {
      next.push(child);
    } else if (
      child.type === 'textDirective' &&
      isStyle(child, inHeading) &&
      hasLabel(child, sourceOf(child, source))
    ) {
      next.push(child);
    } else {
      next.push(...replacement(child, source));
    }
  }
  parent.children = next as Parent['children'];
}

/**
 * Keep only known, well-formed style directives (`:u`, `:small`, `:large`, `:color{.name}`).
 * Anything else becomes plain content: a labelled directive its label, a label-less one its exact
 * source, leaf/container blocks a paragraph or their children; sizes inside headings are dropped
 * (FR-005, contract §3).
 */
export function remarkNormalizeStyles() {
  return (tree: Root, file?: SourceFile): void => {
    normalizeChildren(tree, file?.toString(), false);
  };
}

/** `hName`/`hProperties` as remark-rehype reads them (typed by mdast-util-to-hast where installed). */
type HastData = { hName: string; hProperties?: { className: string[] } };

function hastFor(node: TextDirective): HastData {
  if (node.name === UNDERLINE) return { hName: 'u' };
  if (isTextSize(node.name))
    return { hName: 'span', hProperties: { className: [sizeClass(node.name)] } };
  const color = directiveColor(node);
  return {
    hName: 'span',
    hProperties: {
      className: color && isPaletteColor(color) ? [COLOR_CLASS, colorClass(color)] : [],
    },
  };
}

function mapChildren(parent: Parent): void {
  for (const child of parent.children) {
    if (child.type === 'textDirective') {
      child.data = { ...child.data, ...hastFor(child) } as TextDirective['data'];
    }
    if ('children' in child) mapChildren(child as Parent);
  }
}

/** Map the (normalised) style directives to `<u>` and `rt-*` spans for remark-rehype. */
export function remarkStylesToHast() {
  return (tree: Root): void => {
    mapChildren(tree);
  };
}

/** Replace every style directive with its label content (for plain/model text, D288). */
export function remarkUnwrapStyles() {
  return (tree: Root): void => {
    unwrapChildren(tree);
  };
}

function unwrapChildren(parent: Parent): void {
  const next: RootContent[] = [];
  for (const child of parent.children) {
    if ('children' in child) unwrapChildren(child as Parent);
    if (child.type === 'textDirective') next.push(...child.children);
    else next.push(child);
  }
  parent.children = next as Parent['children'];
}
