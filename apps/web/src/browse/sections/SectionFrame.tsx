import type { ReactElement, ReactNode } from 'react';

/** D246: one titled block under the card (Details, Source), a named region for assistive tech. */
export function SectionFrame({
  id,
  title,
  children,
}: {
  /** Unique per page: the heading id. */
  id: string;
  title: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="browse-section" aria-labelledby={id}>
      <h3 className="browse-section__heading" id={id}>
        {title}
      </h3>
      {children}
    </section>
  );
}
