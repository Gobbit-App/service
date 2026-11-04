import type { ReactElement } from 'react';
import type { RichBodyEditorProps } from '../editor/rich/RichBodyEditor';

/**
 * Stand-in for the Milkdown body editor in form tests: a textarea with the same name, description
 * and invalid state, so tests can `fireEvent.change` the body.
 * Use: `vi.mock('<path>/editor/rich/RichBodyEditor', () => import('<path>/test/rich-editor-mock'))`.
 */
export default function RichBodyEditorMock({
  value,
  onChange,
  labelId,
  describedBy,
  invalid,
  disabled,
}: RichBodyEditorProps): ReactElement {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      disabled={disabled}
    />
  );
}
