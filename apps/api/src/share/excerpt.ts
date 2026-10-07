/** Remove markdown formatting to get plain text. */
export function stripMarkdown(md: string): string {
  let result = md;

  // Remove code fences (``` with optional language)
  result = result.replace(/```[\s\S]*?```/g, (match) => {
    const inner = match.replace(/^```.*?\n/, '').replace(/\n```$/, '');
    return inner;
  });

  // Remove inline code backticks
  result = result.replace(/`([^`]+)`/g, '$1');

  // Images ![alt](url) -> alt
  result = result.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');

  // Links [text](url) -> text
  result = result.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // Autolinks <url> -> url
  result = result.replace(/<(https?:\/\/[^>]+)>/g, '$1');

  // Remove HTML tags
  result = result.replace(/<[^>]+>/g, '');

  // Remove heading # at line start
  result = result.replace(/^#+\s+/gm, '');

  // Remove blockquote > at line start
  result = result.replace(/^>\s*/gm, '');

  // Remove list markers at line start (-, *, +, 1.)
  result = result.replace(/^[-*+]\s+/gm, '');
  result = result.replace(/^\d+\.\s+/gm, '');

  // Remove table separator rows (|---|---|)
  result = result.replace(/^\|[\s\-|]*\|$/gm, '');

  // Remove table pipes -> space
  result = result.replace(/\|/g, ' ');

  // Remove strikethrough ~~text~~
  result = result.replace(/~~([^~]+)~~/g, '$1');

  // Remove bold emphasis: ** and __
  result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
  result = result.replace(/__([^_]+)__/g, '$1');

  // Remove italic emphasis: * and _ (only at word boundaries)
  result = result.replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '$1');
  result = result.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1');

  // Remove horizontal rules (---, ***)
  result = result.replace(/^(-{3,}|\*{3,})$/gm, '');

  // Collapse all whitespace runs (including newlines) to one space
  result = result.replace(/\s+/g, ' ');

  // Trim
  result = result.trim();

  return result;
}

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

/** Get excerpt: strip markdown and truncate. */
export function excerpt(md: string, max: number): string {
  return truncateText(stripMarkdown(md), max);
}

/** Max code points for OG description. */
export const OG_DESCRIPTION_MAX = 160;

/** Max code points for OG image excerpt. */
export const OG_IMAGE_EXCERPT_MAX = 140;
