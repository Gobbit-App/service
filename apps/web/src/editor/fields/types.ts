import type { Deck, ItemType } from '@pb/shared';
import type { DraftPayloadByType } from '../draft';
import type { FieldErrors } from '../validate';

/** Props every payload editor gets (contracts/editor-ui.md); 008 registers `image`. */
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
};
