import type { ReactElement, ReactNode } from 'react';

/** Banner shown when offline. */
export function OfflineBanner({ visible }: { visible: boolean }): ReactElement | null {
  if (!visible) return null;
  return (
    <div className="offline-banner" role="status">
      You're offline — showing saved cards.
    </div>
  );
}

/** Empty state with title, optional body and action. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}): ReactElement {
  return (
    <section className="empty-state">
      <h2 className="empty-state__title">{title}</h2>
      {children && <div className="empty-state__body">{children}</div>}
      {action && <div className="empty-state__action">{action}</div>}
    </section>
  );
}

/** Error state with alert role and optional retry button. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}): ReactElement {
  return (
    <section className="error-state" role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </section>
  );
}

/** Prompt to reload when a new version is available. */
export function UpdatePrompt({
  visible,
  onUpdate,
  onDismiss,
}: {
  visible: boolean;
  onUpdate: () => void;
  onDismiss: () => void;
}): ReactElement | null {
  if (!visible) return null;
  return (
    <div className="update-prompt" role="status">
      <span>A new version of Gobbit is ready.</span>
      <button type="button" className="button" onClick={onUpdate}>
        Reload
      </button>
      <button type="button" className="button button--ghost" onClick={onDismiss}>
        Later
      </button>
    </div>
  );
}

/** Loading indicator with optional label. */
export function LoadingState({ label = 'Loading…' }: { label?: string }): ReactElement {
  return (
    <p className="loading-state" role="status">
      {label}
    </p>
  );
}
