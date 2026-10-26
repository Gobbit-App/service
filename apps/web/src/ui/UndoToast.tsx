import { useEffect, useRef, type ReactElement } from 'react';
import { dismissToast, useToast } from './toast-store';
import { Button } from './buttons/Button';

/** D146: how long the Undo offer stays on screen. */
export const UNDO_TOAST_MS = 6000;

/** A message with at most one action; dismisses itself after `timeoutMs`. */
export function UndoToast({
  message,
  actionLabel,
  onAction,
  onDismiss,
  timeoutMs = UNDO_TOAST_MS,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  timeoutMs?: number;
}): ReactElement {
  // latest onDismiss without restarting the timer when the parent re-renders
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  useEffect(() => {
    const timer = setTimeout(() => dismissRef.current(), timeoutMs);
    return () => clearTimeout(timer);
  }, [message, timeoutMs]);

  return (
    <div className="toast" role="status">
      <span className="toast__message">{message}</span>
      {actionLabel && onAction && (
        <Button
          icon="undo"
          label={actionLabel}
          variant="ghost"
          className="toast__action"
          onClick={() => {
            onAction();
            onDismiss();
          }}
        />
      )}
    </div>
  );
}

/** Renders the app-wide toast (mounted once in the root layout). */
export function ToastHost(): ReactElement | null {
  const toast = useToast();
  if (!toast) return null;
  return (
    <UndoToast
      key={toast.id}
      message={toast.message}
      actionLabel={toast.action?.label}
      onAction={toast.action?.onAction}
      onDismiss={() => dismissToast(toast.id)}
    />
  );
}
