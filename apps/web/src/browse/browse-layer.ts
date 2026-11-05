/** D332: the layers over Browse; each is a pushed history entry, so system back closes it. */
export type BrowseLayer = 'categories' | 'full';

const LAYERS: readonly BrowseLayer[] = ['categories', 'full'];

/** The open layer from router location state; anything else (or nothing) means none. */
export function browseLayerFromState(state: unknown): BrowseLayer | null {
  if (typeof state !== 'object' || state === null) return null;
  const layer = (state as { browseLayer?: unknown }).browseLayer;
  return LAYERS.find((name) => name === layer) ?? null;
}

/** The state for opening `layer` on top of `prev`, keeping the rest (`fromList`, D245). */
export function withLayer<T extends object>(
  prev: T | undefined,
  layer: BrowseLayer,
): T & { browseLayer: BrowseLayer } {
  return { ...(prev ?? ({} as T)), browseLayer: layer };
}

/** `prev` without a layer, for replacing an entry that must not reopen one. */
export function withoutLayer<T extends object>(prev: T | undefined): Omit<T, 'browseLayer'> {
  if (!prev) return {} as Omit<T, 'browseLayer'>;
  const { browseLayer: _layer, ...rest } = prev as T & { browseLayer?: unknown };
  return rest;
}
