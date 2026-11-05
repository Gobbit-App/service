import {
  useEffect,
  useRef,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react';
import { classNames } from '../buttons/button-props';
import './sheet.css';

export type SheetProps = {
  /** Id of the sheet's heading (its accessible name). */
  labelledBy: string;
  describedBy?: string;
  /** Escape or a tap on the backdrop: the "keep things as they are" answer. */
  onClose: () => void;
  /** Focused on open; the first focusable element otherwise (native dialog behaviour). */
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
};

/**
 * D304 (039): the one sheet pattern. A native modal `<dialog>` (focus stays inside, the page behind
 * is inert, it sits in the top layer), drawn as a bottom sheet on phones and a centred dialog from
 * 600 px. Mount it only while it is open; focus goes back to where it was when it unmounts.
 */
export function Sheet({
  labelledBy,
  describedBy,
  onClose,
  initialFocus,
  className,
  children,
}: SheetProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // jsdom has no showModal; browsers all do (the PWA's targets).
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    initialFocus?.current?.focus();
    return () => {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      if (previous?.isConnected) previous.focus();
    };
    // Opening is a mount-time effect; the initial focus target is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    // The parent decides whether the sheet unmounts; the dialog never closes itself.
    event.preventDefault();
    onClose();
  };

  // The body fills the dialog, so a click whose target is the dialog itself hit the backdrop.
  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <dialog
      ref={ref}
      className={classNames('sheet', className)}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={onCancel}
      onClick={onClick}
    >
      <div className="sheet__body">{children}</div>
    </dialog>
  );
}
