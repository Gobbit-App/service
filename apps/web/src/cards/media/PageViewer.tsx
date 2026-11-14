import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { IconButton } from '../../ui/buttons/IconButton';
import { ButtonLink } from '../../ui/buttons/ButtonLink';

/** One photo of a gallery or one page of a PDF, as the viewer shows it. */
export interface ViewerPage {
  key: string;
  /** URL of this page at a width (the viewer asks for the width it shows). */
  src: (width: number) => string;
  width?: number;
  height?: number;
  /** Accessible name; a gallery photo's description is also shown under it. */
  alt: string;
  description?: string;
}

export interface PageViewerProps {
  title: string;
  pages: ViewerPage[];
  /** Photos side by side (swipe), PDF pages top to bottom (scroll). */
  axis: 'x' | 'y';
  /** "k of N" for photos, "Page k of N" for a PDF. */
  counter: (current: number, total: number) => string;
  /** PDF: the original file, opened by the device (FR-013). */
  originalHref?: string;
  startIndex?: number;
  onClose: () => void;
}

/** D399: fit width → 2× → 3×, re-requesting a wider image and panning with native scroll. */
const ZOOMS = [1, 2, 3] as const;
const VIEW_WIDTHS = [720, 1080, 2160] as const;

/**
 * D399 (lazy chunk): one full-screen viewer for gallery photos and PDF pages. Native scroll-snap
 * (no gesture library, ADR-065), arrow keys, zoom steps, the current position, and focus back on
 * the card when it closes. Pages load lazily; only what the reader reaches is fetched (SC-004).
 */
export function PageViewer({
  title,
  pages,
  axis,
  counter,
  originalHref,
  startIndex = 0,
  onClose,
}: PageViewerProps): ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const [current, setCurrent] = useState(startIndex);
  const [zoom, setZoom] = useState(0);

  useEffect(() => {
    opener.current = document.activeElement;
    const el = dialog.current;
    if (el && typeof el.showModal === 'function' && !el.open) el.showModal();
    else el?.setAttribute('open', '');
    return () => {
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, []);

  const scrollTo = useCallback((index: number) => {
    const node = scroller.current?.children[index] as HTMLElement | undefined;
    node?.scrollIntoView?.({ block: 'start', inline: 'start' });
  }, []);

  const goTo = (index: number) => {
    const bounded = Math.max(0, Math.min(pages.length - 1, index));
    scrollTo(bounded);
    setCurrent(bounded);
  };

  // `current` starts at `startIndex`; the page only has to be scrolled into view.
  useEffect(() => {
    if (startIndex > 0) scrollTo(startIndex);
  }, [scrollTo, startIndex]);

  // Which page is in view (the counter follows scrolling and swiping).
  useEffect(() => {
    const root = scroller.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting)
            setCurrent(Number((entry.target as HTMLElement).dataset['index']));
        }
      },
      { root, threshold: 0.6 },
    );
    for (const child of Array.from(root.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [pages.length]);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    const next = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    const previous = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    if (event.key === next) {
      event.preventDefault();
      goTo(current + 1);
    } else if (event.key === previous) {
      event.preventDefault();
      goTo(current - 1);
    }
  };

  const viewWidth = VIEW_WIDTHS[zoom];
  const total = pages.length;

  return (
    <dialog
      ref={dialog}
      className={`page-viewer page-viewer--${axis}`}
      aria-label={title}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="page-viewer__bar">
        <p className="page-viewer__count" aria-live="polite">
          {counter(current + 1, total)}
        </p>
        <IconButton
          icon="zoom-out"
          label="Zoom out"
          disabledReason={zoom === 0 ? 'Already at full width' : null}
          onClick={() => setZoom((z) => Math.max(0, z - 1))}
        />
        <IconButton
          icon="zoom-in"
          label="Zoom in"
          disabledReason={zoom === ZOOMS.length - 1 ? 'Already at the closest zoom' : null}
          onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
        />
        {originalHref && (
          <ButtonLink
            href={originalHref}
            icon="external"
            label="Open original"
            variant="ghost"
            external
          />
        )}
        <IconButton icon="close" label="Close" onClick={onClose} />
      </header>
      <div
        ref={scroller}
        className="page-viewer__pages"
        style={{ ['--page-zoom' as string]: String(ZOOMS[zoom]) }}
        tabIndex={0}
      >
        {pages.map((page, index) => (
          <figure key={page.key} className="page-viewer__page" data-index={index}>
            <img
              src={page.src(viewWidth)}
              alt={page.alt}
              width={page.width}
              height={page.height}
              loading={Math.abs(index - current) <= 1 ? 'eager' : 'lazy'}
              decoding="async"
            />
            {page.description && <figcaption>{page.description}</figcaption>}
          </figure>
        ))}
      </div>
    </dialog>
  );
}
