import { toPlainText } from '../rich-text/plain-text';

/** Truncate text to max code points, with smart word boundary detection. */
export function truncateText(text: string, max: number): string {
  const codePoints = Array.from(text);

  if (codePoints.length <= max) {
    return text;
  }

  // Take first max-1 code points
  let cut = codePoints.slice(0, max - 1);

  // The cut already ends on a word boundary: keep every whole word
  if (/\s/.test(codePoints[max - 1] ?? '')) {
    return `${cut.join('').trimEnd()}…`;
  }

  // Check the last 20 code points of this cut for whitespace
  const startOfLast20 = Math.max(0, cut.length - 20);
  const last20 = cut.slice(startOfLast20);

  // Find the last whitespace in the last 20 code points
  let lastWhitespaceInLast20 = -1;
  for (let i = last20.length - 1; i >= 0; i--) {
    if (/\s/.test(last20[i])) {
      lastWhitespaceInLast20 = i;
      break;
    }
  }

  if (lastWhitespaceInLast20 >= 0) {
    // Cut at the last whitespace (remove the whitespace and everything after)
    const absolutePos = startOfLast20 + lastWhitespaceInLast20;
    cut = cut.slice(0, absolutePos);
  }

  // Convert back to string and trim end
  let result = cut.join('').trimEnd();

  // Append '…'
  result = result + '…';

  return result;
}

/** Get excerpt: the body's plain words (D288), truncated. */
export function excerpt(md: string, max: number): string {
  return truncateText(toPlainText(md), max);
}

/** Max code points for OG description. */
export const OG_DESCRIPTION_MAX = 160;

/** Max code points for OG image excerpt. */
export const OG_IMAGE_EXCERPT_MAX = 140;
