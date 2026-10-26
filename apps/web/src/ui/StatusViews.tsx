import type { ReactElement, ReactNode } from 'react';
import { Button } from './buttons/Button';

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
      {onRetry && <Button icon="refresh" label="Try again" onClick={onRetry} />}
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
      <Button icon="refresh" label="Reload" onClick={onUpdate} />
      <Button icon="close" label="Later" variant="ghost" onClick={onDismiss} />
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
