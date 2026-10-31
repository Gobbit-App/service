import { textDirection } from '@gobbit/shared';

export type OgNode = {
  type: string;
  props: {
    style?: Record<string, string | number>;
    children?: OgChild | OgChild[];
  };
};

export type OgChild = OgNode | string;

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
export const OG_TEMPLATE_FONT = 'Inter, Noto Sans Hebrew';

export const OG_COLORS = {
  background: '#fbf6ef',
  accent: '#b4532a',
  text: '#2b211a',
  muted: '#7a6a5d',
} as const;

export type OgCardInput = {
  title: string;
  excerpt: string;
  categoryName: string | null;
  deckName: string;
};

/** Build a text node with automatic direction detection. */
function textNode(text: string, additionalStyle: Record<string, string | number> = {}): OgNode {
  const dir = textDirection(text);
  const align = dir === 'rtl' ? 'right' : 'left';
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        direction: dir,
        textAlign: align,
        ...additionalStyle,
      },
      children: text,
    },
  };
}

/** Build an OG card tree for a shared item. */
export function ogCardTree(input: OgCardInput): OgNode {
  const categoryDir = input.categoryName ? textDirection(input.categoryName) : 'ltr';

  const children: OgChild[] = [];

  // Category chip (optional)
  if (input.categoryName) {
    children.push({
      type: 'div',
      props: {
        style: {
          backgroundColor: OG_COLORS.accent,
          color: 'white',
          fontSize: 28,
          borderRadius: 999,
          padding: '8px 24px',
          alignSelf: categoryDir === 'rtl' ? 'flex-end' : 'flex-start',
          display: 'flex',
          direction: categoryDir,
          textAlign: categoryDir === 'rtl' ? 'right' : 'left',
        },
        children: input.categoryName,
      },
    });
  }

  // Title
  children.push(
    textNode(input.title, {
      fontSize: 64,
      fontWeight: 700,
      color: OG_COLORS.text,
      lineHeight: 1.15,
      marginTop: 32,
    }),
  );

  // Excerpt (optional)
  if (input.excerpt !== '') {
    children.push(
      textNode(input.excerpt, {
        fontSize: 34,
        color: OG_COLORS.muted,
        lineHeight: 1.4,
        marginTop: 24,
      }),
    );
  }

  // Spacer
  children.push({
    type: 'div',
    props: {
      style: {
        flexGrow: 1,
      },
    },
  });

  // Footer
  children.push({
    type: 'div',
    props: {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 28,
        color: OG_COLORS.muted,
      },
      children: [
        textNode(input.deckName, {}),
        {
          type: 'div',
          props: {
            style: {
              fontWeight: 700,
              color: OG_COLORS.accent,
              display: 'flex',
              direction: 'ltr',
              textAlign: 'left',
            },
            children: 'Gobbit',
          },
        },
      ],
    },
  });

  return {
    type: 'div',
    props: {
      style: {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        padding: 72,
        backgroundColor: OG_COLORS.background,
        fontFamily: OG_TEMPLATE_FONT,
        borderTop: `16px solid ${OG_COLORS.accent}`,
      },
      children,
    },
  };
}

/**
 * The one private preview (D59): served for private, missing and deleted items alike, so it
 * carries nothing item- or deck-derived (not even the deck kind).
 */
export function privateCardTree(): OgNode {
  return {
    type: 'div',
    props: {
      style: {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        padding: 72,
        backgroundColor: OG_COLORS.background,
        fontFamily: OG_TEMPLATE_FONT,
        borderTop: `16px solid ${OG_COLORS.accent}`,
      },
      children: [
        textNode('A card was shared with you', {
          fontSize: 64,
          fontWeight: 700,
          color: OG_COLORS.text,
          lineHeight: 1.15,
          marginTop: 32,
        }),
        textNode('Open it in Gobbit', {
          fontSize: 34,
          color: OG_COLORS.muted,
          lineHeight: 1.4,
          marginTop: 24,
        }),
        {
          type: 'div',
          props: {
            style: {
              flexGrow: 1,
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 28,
              color: OG_COLORS.muted,
            },
            children: [
              textNode('Private card', {}),
              {
                type: 'div',
                props: {
                  style: {
                    fontWeight: 700,
                    color: OG_COLORS.accent,
                    display: 'flex',
                    direction: 'ltr',
                    textAlign: 'left',
                  },
                  children: 'Gobbit',
                },
              },
            ],
          },
        },
      ],
    },
  };
}

/** D229: the landing page's static preview (rendered by `pnpm og:static`, served by the web image). */
export const LANDING_OG_IMAGE_PATH = '/og/landing.png';

/** A stacked-cards motif: three offset cards, the front one with two text lines. */
function cardMotif(): OgNode {
  const card = (offset: number, opacity: number, lines: boolean): OgNode => ({
    type: 'div',
    props: {
      style: {
        position: 'absolute',
        top: offset,
        left: offset,
        width: 300,
        height: 190,
        display: 'flex',
        flexDirection: 'column',
        padding: 28,
        borderRadius: 24,
        backgroundColor: 'white',
        border: `3px solid ${OG_COLORS.accent}`,
        opacity,
      },
      children: lines
        ? [
            {
              type: 'div',
              props: {
                style: {
                  width: 180,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: OG_COLORS.accent,
                },
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  width: 230,
                  height: 14,
                  marginTop: 22,
                  borderRadius: 7,
                  backgroundColor: OG_COLORS.muted,
                  opacity: 0.5,
                },
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  width: 150,
                  height: 14,
                  marginTop: 14,
                  borderRadius: 7,
                  backgroundColor: OG_COLORS.muted,
                  opacity: 0.5,
                },
              },
            },
          ]
        : [],
    },
  });
  return {
    type: 'div',
    props: {
      style: { position: 'relative', display: 'flex', width: 380, height: 270 },
      children: [card(0, 0.35, false), card(40, 0.6, false), card(80, 1, true)],
    },
  };
}

/** D229: brand, tagline and the card motif; nothing visitor-derived. */
export function landingTree(): OgNode {
  return {
    type: 'div',
    props: {
      style: {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 72,
        backgroundColor: OG_COLORS.background,
        fontFamily: OG_TEMPLATE_FONT,
        borderTop: `16px solid ${OG_COLORS.accent}`,
      },
      children: [
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', width: 620 },
            children: [
              textNode('Gobbit', { fontSize: 96, fontWeight: 700, color: OG_COLORS.accent }),
              textNode('A deck of useful cards for your family and community', {
                fontSize: 44,
                fontWeight: 700,
                color: OG_COLORS.text,
                lineHeight: 1.2,
                marginTop: 16,
              }),
              textNode('Join the waitlist', {
                fontSize: 32,
                color: OG_COLORS.muted,
                marginTop: 32,
              }),
            ],
          },
        },
        cardMotif(),
      ],
    },
  };
}
