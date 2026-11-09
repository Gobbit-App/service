/** A link preview while editing (link cards and 042 event cards). */
export type DraftLinkPreview = {
  title?: string;
  description?: string;
  image?: string;
  /** 015 "Add photo": a recorded asset of the deck; `null` asks the server to remove it. */
  publicId?: string | null;
  width?: number;
  height?: number;
};

/**
 * The preview as the API expects it: blank text keys dropped, dimensions left to the server, an
 * explicit `publicId: null` kept (removes the photo, 015). `undefined` when nothing is left.
 */
export function previewToPayload(
  preview: DraftLinkPreview | undefined,
): Record<string, string | null> | undefined {
  const cleaned: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(preview ?? {})) {
    if (typeof value === 'string' && value.trim() !== '') cleaned[key] = value;
  }
  if (preview?.publicId === null) cleaned['publicId'] = null;
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}
