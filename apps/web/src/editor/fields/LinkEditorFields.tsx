import type { ReactElement } from 'react';
import { FetchPreview } from './FetchPreview';
import { LinkFields } from './LinkFields';
import { LinkPhoto } from './LinkPhoto';
import type { FieldsProps } from './types';

/** The card editor's link fields: `LinkFields` plus "Fetch preview" (D134) and "Add photo" (015). */
export function LinkEditorFields(props: FieldsProps<'link'>): ReactElement {
  return (
    <LinkFields
      {...props}
      previewSlot={(ctx) => (
        <>
          <FetchPreview {...ctx} deckId={props.deck.id} disabled={props.disabled} />
          <LinkPhoto {...ctx} deckId={props.deck.id} disabled={props.disabled} />
        </>
      )}
    />
  );
}
