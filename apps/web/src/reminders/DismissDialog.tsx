import { useEffect, useId, useRef, useState, type ReactElement, type SyntheticEvent } from 'react';
import type { Item } from '@gobbit/shared';
import { codePointLength } from '@gobbit/shared/card-limits';
import { REMINDER_RESOLUTION_MAX } from '@gobbit/shared/reminder-constants';
import { useOnline } from '../api/offline';
import { Button } from '../ui/buttons/Button';
import { dismissErrorMessage, useDismiss } from './use-dismiss';
import './reminders.css';

export const DISMISS_OFFLINE = 'Dismissing needs a connection.';
export const DONE_OFF_REASON = 'turn on Done first';
const OFFLINE_REASON = 'needs a connection';

/**
 * contracts/web-ui.md: dismiss a reminder. "Done" starts off, so marking it done is a deliberate
 * choice; "Dismiss without marking done" closes it either way. Native modal dialog (focus kept
 * inside, Escape cancels, focus returns). Mount it only while asking.
 */
export function DismissDialog({
  item,
  deckSlug,
  onClose,
}: {
  item: Item;
  deckSlug: string;
  onClose: () => void;
}): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const switchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const counterId = useId();
  const noteId = useId();
  const online = useOnline();
  const dismiss = useDismiss(item, deckSlug);
  const [done, setDone] = useState(false);
  const [resolution, setResolution] = useState('');

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // jsdom has no showModal; browsers all do (the PWA's targets).
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    switchRef.current?.focus();
    return () => {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const onCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onClose();
  };

  const length = codePointLength(resolution.trim());
  const tooLong = length > REMINDER_RESOLUTION_MAX;
  const offline = online ? null : OFFLINE_REASON;
  const busy = dismiss.isPending;

  const submit = (asDone: boolean) => {
    const text = resolution.trim();
    dismiss.mutate({ done: asDone, ...(text ? { resolution: text } : {}) }, { onSuccess: onClose });
  };

  return (
    <dialog ref={ref} className="dismiss-dialog" aria-labelledby={titleId} onCancel={onCancel}>
      <h2 id={titleId} className="dismiss-dialog__title">
        Dismiss “{item.title}”
      </h2>
      <label className="switch dismiss-dialog__done">
        <input
          ref={switchRef}
          type="checkbox"
          role="switch"
          checked={done}
          disabled={busy}
          onChange={(event) => setDone(event.currentTarget.checked)}
        />
        <span>Done</span>
      </label>
      <div className="field">
        <label htmlFor={`${titleId}-resolution`}>What happened? (optional)</label>
        <textarea
          id={`${titleId}-resolution`}
          rows={3}
          value={resolution}
          disabled={busy}
          aria-invalid={tooLong ? true : undefined}
          aria-describedby={counterId}
          onChange={(event) => setResolution(event.currentTarget.value)}
        />
        <p id={counterId} className={tooLong ? 'field__error' : 'field__hint'}>
          {length}/{REMINDER_RESOLUTION_MAX}
        </p>
      </div>
      {!online && (
        <p id={noteId} className="muted">
          {DISMISS_OFFLINE}
        </p>
      )}
      {dismiss.isError && (
        <p className="form-error" role="alert">
          {dismissErrorMessage(dismiss.error)}
        </p>
      )}
      <div className="dismiss-dialog__buttons">
        <Button
          icon="check"
          label="Mark done"
          disabledReason={offline ?? (done ? null : DONE_OFF_REASON)}
          disabled={busy || tooLong}
          onClick={() => submit(true)}
        />
        <Button
          icon="bell-off"
          label="Dismiss without marking done"
          variant="ghost"
          disabledReason={offline}
          disabled={busy || tooLong}
          onClick={() => submit(false)}
        />
        <Button icon="close" label="Cancel" variant="ghost" onClick={onClose} />
      </div>
    </dialog>
  );
}
