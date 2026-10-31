import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { IMPORT_ROWS_PER_PREVIEW } from '@gobbit/shared/ingest-constants';
import type { ImportCategory, ImportRow } from '@gobbit/shared/import';
import { ImportPreview } from './ImportPreview';
import { importableRows, previewRows, type PreviewRow } from './preview-rows';

const CATEGORIES: ImportCategory[] = [{ id: 'c1', name: 'Recipes', slug: 'recipes' }];

const note = (line: number, overrides: Partial<ImportRow> = {}): ImportRow => ({
  line,
  type: 'text',
  title: `Note ${line}`,
  body: '',
  sourceUrl: null,
  category: null,
  error: null,
  ...overrides,
});

/** A controlled preview: edits flow back in, the last rows are readable through `latest`. */
function renderPreview(rows: ImportRow[], onImport = vi.fn()) {
  const latest: { rows: PreviewRow[] } = { rows: previewRows(rows) };
  function Harness() {
    const [current, setCurrent] = useState(latest.rows);
    return (
      <ImportPreview
        rows={current}
        categories={CATEGORIES}
        busy={false}
        onChange={(next) => {
          latest.rows = next;
          setCurrent(next);
        }}
        onImport={onImport}
        onBack={vi.fn()}
      />
    );
  }
  render(<Harness />);
  return { latest, onImport };
}

describe('ImportPreview (D189)', () => {
  it('counts the notes and imports the ticked ones; unticking lowers the count', () => {
    const { latest, onImport } = renderPreview([note(1), note(2), note(3)]);
    expect(screen.getByText('3 notes found.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Import line 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 cards' }));
    expect(onImport).toHaveBeenCalled();
    expect(importableRows(latest.rows).map((r) => r.line)).toEqual([1, 3]);
  });

  it("shows why an invalid row can't be imported and ticks it once the edit fixes it", () => {
    const { latest } = renderPreview([note(1), note(2, { title: '', error: 'No title' })]);
    expect(
      screen.getByText("2 notes found, 1 can't be imported until edited."),
    ).toBeInTheDocument();
    expect(screen.getByText('No title')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Import line 2' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Import 1 card' })).toBeEnabled();

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]!);
    fireEvent.change(screen.getByLabelText('Title, line 2'), { target: { value: 'Fixed' } });
    expect(screen.queryByText('No title')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Import line 2' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Import 2 cards' })).toBeEnabled();
    expect(latest.rows[1]).toMatchObject({ title: 'Fixed', error: null, included: true });
  });

  it('marks a category the deck has as existing and any other as new', () => {
    renderPreview([note(1, { category: 'recipes' }), note(2, { category: 'Garden' })]);
    const [existing, created] = screen.getAllByRole('listitem');
    expect(existing).toHaveTextContent('existing category');
    expect(created).toHaveTextContent('new category');
  });

  it('refuses more than a preview holds and asks to split the file', () => {
    const rows = Array.from({ length: IMPORT_ROWS_PER_PREVIEW + 1 }, (_, i) => note(i + 1));
    renderPreview(rows);
    expect(screen.getByRole('alert')).toHaveTextContent('Split the file');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByRole('button', { name: /^Import \d+ cards$/ })).toBeDisabled();
  });

  it('disables Import when nothing is ticked', () => {
    renderPreview([note(1)]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Import line 1' }));
    expect(screen.getByRole('button', { name: 'Import 0 cards' })).toBeDisabled();
  });
});
