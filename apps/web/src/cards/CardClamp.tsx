import { useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '../ui/buttons/Button';

/**
 * A list card's content, capped at a share of the screen (`.card__clip` in styles.css) with a
 * per-card Show more / Show less. Not remembered: every render of the list starts collapsed.
 */
export function CardClamp({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): ReactElement {
  const clip = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const id = useId();

  // Measured only while collapsed (expanded, the box fits by definition); media load late, so watch.
  useLayoutEffect(() => {
    const box = clip.current;
    const inner = content.current;
    if (expanded || !box || !inner) return;
    const measure = () => setOverflows(inner.offsetHeight > box.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    observer.observe(box);
    return () => observer.disconnect();
  }, [expanded]);

  const toggle = () => {
    if (!expanded) return setExpanded(true);
    flushSync(() => setExpanded(false));
    const card = clip.current?.closest('article');
    // Collapsing from deep inside a long card would strand the reader further down the list.
    if (card && card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: 'center' });
  };

  const label = expanded ? 'Show less' : 'Show more';
  return (
    <>
      <div
        ref={clip}
        id={id}
        className={`card__clip${expanded ? ' card__clip--open' : overflows ? ' card__clip--more' : ''}`}
        // Focus or find-in-page scrolling the clipped part opens it rather than shifting it.
        onScroll={() => setExpanded(true)}
      >
        <div ref={content} className="card__clip-content">
          {children}
        </div>
      </div>
      {overflows && (
        <Button
          className="card__clamp-toggle"
          icon="chevron-down"
          label={label}
          aria-label={`${label}: ${title}`}
          variant="ghost"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={toggle}
        />
      )}
    </>
  );
}
