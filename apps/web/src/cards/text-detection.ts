import { createContext, useContext, type ReactNode } from 'react';
import type { Components, Options } from 'react-markdown';

type PluggableList = NonNullable<Options['remarkPlugins']>;

/**
 * D340: how a surface marks emails, phones, web addresses and numbers in card text. Only
 * Browse provides one (`browse/detect/detection.tsx`); everywhere else cards render as before.
 * It lives here so cards never import the Browse chunk.
 */
export type TextDetection = {
  /** Run after the body plugins. */
  remarkPlugins: PluggableList;
  /** Merged over the card's own components. */
  components: Components;
  /** Plain text (table cells) with the same marking. */
  renderText: (text: string) => ReactNode;
};

export const TextDetectionContext = createContext<TextDetection | null>(null);

export function useTextDetection(): TextDetection | null {
  return useContext(TextDetectionContext);
}
