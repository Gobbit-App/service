import { useId, type ReactElement } from 'react';
import { CARD_BODY_MAX, codePointLength } from '@gobbit/shared/card-limits';
import { Button } from '../../ui/buttons/Button';
import { useRichEditorModule, type RichEditorLoader } from '../rich/use-rich-editor-module';
import { LimitMeter } from './LimitMeter';
import { TextInput } from './TextInput';

interface BodyFieldProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  label?: string;
  /** Test seam: how the editor chunk is loaded. */
  loadEditor?: RichEditorLoader;
}

/**
 * The card body (038, D290): a rich editor over the stored Markdown, loaded on demand. The limit
 * counts the Markdown's Unicode code points like the DB CHECK, styles included (FR-012). If the
 * editor can't load or start, the body stays editable as plain Markdown with a Retry.
 */
export function BodyField({
  value,
  onChange,
  error,
  disabled,
  label = 'Body',
  loadEditor,
}: BodyFieldProps): ReactElement {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const editor = useRichEditorModule(loadEditor);
  const meter = <LimitMeter used={codePointLength(value)} max={CARD_BODY_MAX} />;

  if (editor.status === 'failed') {
    return (
      <div className="field">
        <TextInput
          label={label}
          value={value}
          onChange={onChange}
          error={error}
          disabled={disabled}
          multiline
          rows={6}
          hint={meter}
        />
        <p className="rich-editor__fallback" role="status">
          Formatting tools didn’t load. You can keep writing Markdown.
          <Button icon="refresh" label="Retry" variant="ghost" onClick={editor.retry} />
        </p>
      </div>
    );
  }

  const describedBy = [hintId, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className="field">
      <span id={labelId} className="field__label">
        {label}
      </span>
      {editor.status === 'ready' ? (
        <editor.Editor
          value={value}
          onChange={onChange}
          labelId={labelId}
          describedBy={describedBy}
          invalid={Boolean(error)}
          disabled={disabled}
          onFailed={editor.fail}
        />
      ) : (
        <div className="rich-editor__loading" role="status" aria-label="Loading the editor" />
      )}
      <div id={hintId} className="field__hint">
        {meter}
      </div>
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}
