import { describe, it, expect } from 'vitest';
import { ogCardTree, privateCardTree, OG_WIDTH, OG_HEIGHT, type OgChild } from './og-template';

/** Recursively collect all text strings from an OG node tree. */
function collectText(node: OgChild | undefined): string[] {
  if (!node) return [];
  if (typeof node === 'string') return [node];

  if (typeof node === 'object' && node.type) {
    const texts: string[] = [];
    const children = node.props?.children;

    if (children === undefined) return texts;
    if (typeof children === 'string') return [children];
    if (Array.isArray(children)) {
      for (const child of children) {
        texts.push(...collectText(child));
      }
    } else {
      texts.push(...collectText(children));
    }
    return texts;
  }

  return [];
}

describe('ogCardTree', () => {
  it('includes title, excerpt, category, deck name and Gobbit', () => {
    const tree = ogCardTree({
      title: 'My Title',
      excerpt: 'My excerpt',
      categoryName: 'Tech',
      deckName: 'My Deck',
    });

    const texts = collectText(tree);
    expect(texts).toContain('My Title');
    expect(texts).toContain('My excerpt');
    expect(texts).toContain('Tech');
    expect(texts).toContain('My Deck');
    expect(texts).toContain('Gobbit');
  });

  it('excludes category chip text when categoryName is null', () => {
    const tree = ogCardTree({
      title: 'Title',
      excerpt: 'Excerpt',
      categoryName: null,
      deckName: 'Deck',
    });

    const texts = collectText(tree);
    expect(texts).toContain('Title');
    expect(texts).toContain('Excerpt');
    expect(texts).toContain('Deck');
    expect(texts).toContain('Gobbit');
    expect(texts.length).toBe(4);
  });

  it('excludes excerpt node when excerpt is empty', () => {
    const tree = ogCardTree({
      title: 'Title',
      excerpt: '',
      categoryName: 'Category',
      deckName: 'Deck',
    });

    const texts = collectText(tree);
    expect(texts).toContain('Title');
    expect(texts).toContain('Category');
    expect(texts).toContain('Deck');
    expect(texts).toContain('Gobbit');
    expect(texts.length).toBe(4);
  });

  it('has correct root style with width and height', () => {
    const tree = ogCardTree({
      title: 'Title',
      excerpt: 'Excerpt',
      categoryName: null,
      deckName: 'Deck',
    });

    expect(tree.props.style?.width).toBe(OG_WIDTH);
    expect(tree.props.style?.height).toBe(OG_HEIGHT);
  });

  it('applies rtl direction to Hebrew title', () => {
    const tree = ogCardTree({
      title: 'שלום',
      excerpt: 'Test',
      categoryName: null,
      deckName: 'Deck',
    });

    const root = tree;
    const children = Array.isArray(root.props.children)
      ? root.props.children
      : [root.props.children];
    const titleNode = children.find(
      (child) =>
        typeof child === 'object' && child.type === 'div' && child.props?.children === 'שלום',
    );

    expect(titleNode).toBeDefined();
    if (titleNode && typeof titleNode === 'object') {
      expect(titleNode.props.style?.direction).toBe('rtl');
      expect(titleNode.props.style?.textAlign).toBe('right');
    }
  });

  it('keeps English deck name in ltr', () => {
    const tree = ogCardTree({
      title: 'Title',
      excerpt: 'Excerpt',
      categoryName: null,
      deckName: 'English Deck',
    });

    const root = tree;
    const children = Array.isArray(root.props.children)
      ? root.props.children
      : [root.props.children];
    const footerNode = children[children.length - 1];

    if (footerNode && typeof footerNode === 'object' && footerNode.type === 'div') {
      const footerChildren = Array.isArray(footerNode.props.children)
        ? footerNode.props.children
        : [footerNode.props.children];
      const deckNameNode = footerChildren[0];

      if (deckNameNode && typeof deckNameNode === 'object') {
        expect(deckNameNode.props.style?.direction).toBe('ltr');
        expect(deckNameNode.props.style?.textAlign).toBe('left');
      }
    }
  });
});

describe('privateCardTree', () => {
  it('renders only fixed, non-identifying text', () => {
    const texts = collectText(privateCardTree());

    expect(new Set(texts)).toEqual(
      new Set(['A card was shared with you', 'Open it in Gobbit', 'Private card', 'Gobbit']),
    );
  });

  it('is identical across calls', () => {
    expect(privateCardTree()).toEqual(privateCardTree());
  });
});
