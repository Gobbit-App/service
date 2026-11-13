import type { Deck, Item, ItemType } from '@gobbit/shared';
import type { DraftPayloadByType } from '../draft';
import type { FieldErrors } from '../validate';

/** Props every payload editor gets (contracts/editor-ui.md); 008 registered `image` (045: `media`). */
export type FieldsProps<T extends ItemType> = {
  payload: DraftPayloadByType[T];
  onChange: (next: DraftPayloadByType[T]) => void;
  /** Paths under `payload.`. */
  errors: FieldErrors;
  /** 008 needs the deck id for a signed upload. */
  deck: Deck;
  /** True while saving. */
  disabled: boolean;
  /** Fills the card title when it is still empty (008's link Fetch preview). */
  setTitleIfEmpty?: (title: string) => void;
  /** 045 (D398): true while a file is still uploading, so Save waits for it. */
  onUploadingChange?: (uploading: boolean) => void;
  /** The saved card when editing (037: a reminder's `canChangeDismissers`). */
  item?: Item;
};
