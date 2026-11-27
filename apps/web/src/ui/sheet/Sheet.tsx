import {
  useEffect,
  useRef,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react';
import { classNames } from '../buttons/button-props';
import { IconButton } from '../buttons/IconButton';
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
  /** Accessible name of the corner close button shown on the centred dialog (phones swipe the sheet down instead). */
  closeLabel?: string;
  children: ReactNode;
};

const SWIPE_CLOSE_PX = 96;

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
  closeLabel,
  children,
}: SheetProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const dragFrom = useRef<number | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // jsdom has no showModal; browsers all do (the PWA's targets).
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    // A tall sheet opens at its top even when the focused action sits at the bottom (D354).
    initialFocus?.current?.focus({ preventScroll: true });
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

  const dragged = (event: PointerEvent<HTMLElement>) =>
    dragFrom.current === null ? 0 : Math.max(0, event.clientY - dragFrom.current);

  const onGripDown = (event: PointerEvent<HTMLElement>) => {
    dragFrom.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (ref.current) ref.current.style.transition = 'none';
  };

  const onGripMove = (event: PointerEvent<HTMLElement>) => {
    if (ref.current && dragFrom.current !== null) {
      ref.current.style.transform = `translateY(${dragged(event)}px)`;
    }
  };

  const onGripEnd = (event: PointerEvent<HTMLElement>) => {
    const distance = dragged(event);
    dragFrom.current = null;
    if (ref.current) {
      ref.current.style.transition = '';
      ref.current.style.transform = '';
    }
    if (distance >= SWIPE_CLOSE_PX && event.type === 'pointerup') onClose();
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
      <div
        className="sheet__grip"
        aria-hidden="true"
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripEnd}
        onPointerCancel={onGripEnd}
      />
      {closeLabel && (
        <IconButton icon="close" label={closeLabel} className="sheet__close" onClick={onClose} />
      )}
      <div className="sheet__body">{children}</div>
    </dialog>
  );
}
