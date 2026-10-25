import { useState, type ReactElement } from 'react';
import { detectFormat, importFormats, type ImportFormat } from '@pb/shared/import';
import { Button } from '../ui/buttons/Button';

const FORMAT_LABELS: Record<ImportFormat, string> = {
  lines: 'One note per line',
  markdown: 'Markdown (headings become categories)',
  csv: 'CSV (title, body, url, category columns)',
};

export type ImportSource = { text: string; fileName: string | null; format: ImportFormat };

/** D189: paste notes or pick a .txt/.md/.csv file; the format is detected and can be changed. */
export function ImportInput({
  initial,
  onPreview,
}: {
  initial: ImportSource | null;
  onPreview: (source: ImportSource) => void;
}): ReactElement {
  const [text, setText] = useState(initial?.text ?? '');
  const [fileName, setFileName] = useState<string | null>(initial?.fileName ?? null);
  const [format, setFormat] = useState<ImportFormat | null>(initial?.format ?? null);
  const [fileError, setFileError] = useState<string | null>(null);
  const shownFormat = format ?? detectFormat(text, fileName);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    try {
      setText(await file.text());
      setFileName(file.name);
      setFormat(null);
    } catch {
      setFileError("Couldn't read that file.");
    }
  };

  return (
    <form
      className="import-input"
      onSubmit={(event) => {
        event.preventDefault();
        onPreview({ text, fileName, format: shownFormat });
      }}
    >
      <label className="field">
        <span className="field__label">Paste your notes</span>
        <textarea
          rows={10}
          value={text}
          dir="auto"
          onChange={(event) => {
            setText(event.currentTarget.value);
            setFileName(null);
          }}
        />
      </label>
      <label className="field">
        <span className="field__label">Or choose a file</span>
        <input
          type="file"
          accept=".txt,.md,.markdown,.csv,text/plain,text/markdown,text/csv"
          onChange={(event) => void pickFile(event.currentTarget.files?.[0])}
        />
      </label>
      {fileError && <p className="field__error">{fileError}</p>}
      <label className="field">
        <span className="field__label">Format</span>
        <select
          value={shownFormat}
          onChange={(event) => setFormat(event.currentTarget.value as ImportFormat)}
        >
          {importFormats.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABELS[f]}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" icon="eye" label="Preview" disabled={text.trim() === ''} />
    </form>
  );
}
