import { useId, type ReactElement, type ReactNode } from 'react';

/** One titled block of the settings screen; later phases add sections (e.g. connected AI apps). */
export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): ReactElement {
  const headingId = useId();
  return (
    <section className="settings-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {children}
    </section>
  );
}
