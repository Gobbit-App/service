import { useId, type ReactElement, type ReactNode } from 'react';

/** D306 (039): a titled part of the canvas (a type's fields, Details) exposed as a region. */
export function ComposerSection({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}): ReactElement {
  const id = useId();
  return (
    <section
      className={className ? `composer-section ${className}` : 'composer-section'}
      aria-labelledby={id}
    >
      <h2 id={id} className="composer-section__title">
        {title}
      </h2>
      {children}
    </section>
  );
}
