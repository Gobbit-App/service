import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import type { Command, EditorState } from '@milkdown/kit/prose/state';
import { FLOW_CLASS } from '@gobbit/shared/rich-text';
import { FormatToolbar } from './FormatToolbar';
import { createRichEditor, type RichEditor } from './milkdown-setup';
import '../../cards/rich-text.css';
import './rich-editor.css';

export interface RichBodyEditorProps {
  /** The stored Markdown body. */
  value: string;
  onChange: (markdown: string) => void;
  /** The id of the field's visible label. */
  labelId: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** The editor could not start; the field falls back to a plain textarea. */
  onFailed?: (error: unknown) => void;
}

/** What the editor last told the form, and what "unchanged" serialises to (FR-013). */
interface Baseline {
  /** The editor's serialisation of `original`, which may differ textually from it. */
  serialized: string;
  original: string;
  emitted: string;
}

function editorAttributes(
  contentId: string,
  {
    labelId,
    describedBy,
    invalid,
  }: Pick<RichBodyEditorProps, 'labelId' | 'describedBy' | 'invalid'>,
): Record<string, string> {
  return {
    id: contentId,
    class: `rich-editor__content ${FLOW_CLASS}`,
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-labelledby': labelId,
    dir: 'auto',
    ...(describedBy && { 'aria-describedby': describedBy }),
    ...(invalid && { 'aria-invalid': 'true' }),
  };
}

/**
 * D283–D290 / US2: the WYSIWYG body editor. Milkdown edits the Markdown string the card stores;
 * the form only hears about real edits: an untouched or undone-to-start body reports the original
 * string, never the editor's re-serialisation of it (FR-013).
 */
export default function RichBodyEditor({
  value,
  onChange,
  labelId,
  describedBy,
  invalid = false,
  disabled = false,
  onFailed,
}: RichBodyEditorProps): ReactElement {
  const contentId = useId();
  const root = useRef<HTMLDivElement>(null);
  const editor = useRef<RichEditor | null>(null);
  const baseline = useRef<Baseline>({ serialized: value, original: value, emitted: value });
  const [state, setState] = useState<EditorState | null>(null);

  // Latest props for the editor's callbacks, which are created once.
  const latest = useRef({ value, onChange, onFailed, disabled, labelId, describedBy, invalid });
  useLayoutEffect(() => {
    latest.current = { value, onChange, onFailed, disabled, labelId, describedBy, invalid };
  });

  const resetBaseline = (ed: RichEditor, original: string) => {
    baseline.current = { serialized: ed.markdown(), original, emitted: original };
  };

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    let cancelled = false;
    let created: RichEditor | null = null;

    const onMarkdown = (markdown: string) => {
      const { serialized, original } = baseline.current;
      const next = markdown === serialized ? original : markdown;
      baseline.current.emitted = next;
      if (next !== latest.current.value) latest.current.onChange(next);
    };

    const startValue = latest.current.value;
    createRichEditor({
      root: host,
      value: startValue,
      attributes: editorAttributes(contentId, latest.current),
      onMarkdown,
      onState: (next) => {
        if (!cancelled) setState(next);
      },
      isEditable: () => !latest.current.disabled,
    })
      .then((ed) => {
        created = ed;
        if (cancelled) {
          void ed.destroy();
          return;
        }
        editor.current = ed;
        const current = latest.current.value;
        // The value changed while the editor was starting.
        if (current !== startValue) ed.replace(current);
        resetBaseline(ed, current);
      })
      .catch((error: unknown) => {
        if (!cancelled) latest.current.onFailed?.(error);
      });

    return () => {
      cancelled = true;
      editor.current = null;
      if (created) void created.destroy();
    };
  }, [contentId]);

  // External value changes (a reset, a reloaded draft) replace the document.
  useEffect(() => {
    const ed = editor.current;
    if (!ed || value === baseline.current.emitted) return;
    ed.replace(value);
    resetBaseline(ed, value);
  }, [value]);

  useEffect(() => {
    editor.current?.refresh();
  }, [disabled]);

  useEffect(() => {
    editor.current?.view.setProps({
      attributes: editorAttributes(contentId, { labelId, describedBy, invalid }),
    });
  }, [contentId, labelId, describedBy, invalid]);

  const run = useCallback((command: Command) => {
    const view = editor.current?.view;
    if (!view) return;
    command(view.state, view.dispatch, view);
    view.focus();
  }, []);

  const focusEditor = useCallback(() => editor.current?.view.focus(), []);

  return (
    <div className="rich-editor" data-disabled={disabled || undefined}>
      {state && (
        <FormatToolbar
          state={state}
          run={run}
          focusEditor={focusEditor}
          controls={contentId}
          disabled={disabled}
        />
      )}
      <div ref={root} className="rich-editor__root" />
    </div>
  );
}
