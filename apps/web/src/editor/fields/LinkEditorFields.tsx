import type { ReactElement } from 'react';
import { FetchPreview } from './FetchPreview';
import { LinkFields } from './LinkFields';
import type { FieldsProps } from './types';

/** The card editor's link fields: `LinkFields` plus "Fetch preview" in its slot (D134). */
export function LinkEditorFields(props: FieldsProps<'link'>): ReactElement {
  return (
    <LinkFields
      {...props}
      previewSlot={(ctx) => (
        <FetchPreview {...ctx} deckId={props.deck.id} disabled={props.disabled} />
      )}
    />
  );
}
