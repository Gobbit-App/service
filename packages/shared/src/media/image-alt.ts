/**
 * D206: the text alternative for an image card. A non-blank description wins; without one the
 * image is decorative when the card title is shown right next to it (the title already names
 * it), otherwise the title stands in. Zod-free: imported by the PWA and the API's HTML pages.
 */
export function imageAlt({
  alt,
  title,
  titleAdjacent,
}: {
  alt?: string | null;
  title: string;
  titleAdjacent: boolean;
}): string {
  const description = alt?.trim() ?? '';
  if (description !== '') return description;
  return titleAdjacent ? '' : title.trim();
}
