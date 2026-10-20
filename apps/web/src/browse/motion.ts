/** Contract §3: reduced motion pages instantly (`behavior: 'auto'`) and drops band transitions. */
export function prefersReducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

export function pagingBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

/** The page element of `id` in the snap container (ids are compared, never put in a selector). */
export function pageElement(container: HTMLElement | null, id: string): HTMLElement | null {
  if (!container) return null;
  for (const child of Array.from(container.children)) {
    if (child instanceof HTMLElement && child.dataset.itemId === id) return child;
  }
  return null;
}

export function scrollToPage(
  container: HTMLElement | null,
  id: string,
  behavior: ScrollBehavior,
): void {
  pageElement(container, id)?.scrollIntoView({ block: 'start', behavior });
}
