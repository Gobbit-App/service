import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemType } from '@gobbit/shared';
import { requests, respond } from '../test/api-mock';
import { makeCategory, makeDeck, makeItem } from '../test/fixtures';
import type { memoryDraftsKv } from '../test/memory-drafts-kv';
import { chooseCardType } from '../test/choose-card-type';
import { renderInRouter } from '../test/render-in-router';
import { currentToast } from '../ui/toast-store';
import { emptyDraft } from './draft';
import { AUTOSAVE_DELAY_MS } from './use-draft-autosave';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
// jsdom has no IndexedDB: every draft goes to one in-memory store.
vi.mock('./drafts-store', async (importOriginal) => {
  const { memoryDraftsKv } = await import('../test/memory-drafts-kv');
  const kv = memoryDraftsKv();
  return { ...(await importOriginal<typeof import('./drafts-store')>()), idbDraftsKv: () => kv };
});
const { CardEditor } = await import('./CardEditor');
const { idbDraftsKv, newDraftKey, writeDraft } = await import('./drafts-store');
const draftsKv = idbDraftsKv() as ReturnType<typeof memoryDraftsKv>;

const deck = makeDeck({ id: 'deck-1', slug: 'family' });
const categories = [makeCategory({ id: 'cat-general', name: 'General', isDefault: true })];

const renderCreate = (type: ItemType) =>
  renderInRouter(
    <CardEditor
      backHref="/d/family"
      mode="create"
      deck={deck}
      type={type}
      categories={categories}
    />,
  );
const cancel = () => fireEvent.click(screen.getByRole('link', { name: 'Close' }));
const waitPastAutosave = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DELAY_MS + 100)));

async function expectLeavesWithoutAsking(location: () => string) {
  cancel();
  await screen.findByText('Elsewhere');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(location()).toBe('/d/family');
}

beforeEach(async () => {
  respond.mockReset();
  requests.mockReset();
  await draftsKv.clear();
});

describe('CardEditor: new table and calc cards start from a sample (D270, D271)', () => {
  it('a new table shows the sample; untouched it is not unsaved work and no draft is stored', async () => {
    const { location } = await renderCreate('table');
    expect(await screen.findByLabelText('Column 1 heading')).toHaveValue('Item');
    expect(screen.getByLabelText('Row 2, Item')).toHaveValue('Bread');
    await waitPastAutosave();
    expect(draftsKv.map.size).toBe(0);
    await expectLeavesWithoutAsking(location);
  });

  it('a new calc shows the sample and its live result', async () => {
    await renderCreate('calc');
    expect(await screen.findByText('Total: 30', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByLabelText('Expression')).toHaveValue('price * qty');
  });

  it('switching an untouched card to table does not ask on leaving', async () => {
    const { location } = await renderCreate('text');
    chooseCardType('Table');
    expect(await screen.findByLabelText('Column 1 heading')).toHaveValue('Item');
    await waitPastAutosave();
    expect(draftsKv.map.size).toBe(0);
    await expectLeavesWithoutAsking(location);
  });

  it('switching after typing a title still counts as a change', async () => {
    await renderCreate('text');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Groceries' } });
    chooseCardType('Table');
    await screen.findByLabelText('Column 1 heading');
    cancel();
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
  });

  it('Clear empties the table, is a change, and Undo brings the sample back', async () => {
    await renderCreate('table');
    fireEvent.click(await screen.findByRole('button', { name: 'Clear table' }));

    expect(screen.getByLabelText('Column 1 heading')).toHaveValue('');
    expect(screen.getAllByRole('textbox', { name: /^Row \d/ })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Clear table' })).toBeNull();
    expect(currentToast()?.message).toBe('Table cleared');

    act(() => currentToast()?.action?.onAction());
    expect(screen.getByLabelText('Column 1 heading')).toHaveValue('Item');

    fireEvent.click(screen.getByRole('button', { name: 'Clear table' }));
    cancel();
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
  });

  it('Clear empties the calc fields', async () => {
    await renderCreate('calc');
    fireEvent.click(await screen.findByRole('button', { name: 'Clear calculation' }));
    expect(screen.getByLabelText('Expression')).toHaveValue('');
    expect(screen.getByLabelText('Result label')).toHaveValue('');
    expect(screen.getAllByRole('group', { name: /^Field \d/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Clear calculation' })).toBeNull();
  });

  it('a stored draft is offered and restored instead of the sample', async () => {
    const stored = {
      ...emptyDraft('table', 'cat-general'),
      payload: { columns: ['Name', 'Phone'], rows: [['Sam', '555']] },
    };
    await writeDraft(newDraftKey('deck-1', 'table'), stored, null, new Date(), draftsKv);
    await renderCreate('table');
    fireEvent.click(await screen.findByRole('button', { name: /restore/i }));
    await waitFor(() => expect(screen.getByLabelText('Column 1 heading')).toHaveValue('Name'));
  });

  it('editing an existing table shows the card, not the sample', async () => {
    const item = makeItem({
      id: 'i1',
      type: 'table',
      payload: { columns: ['Name'], rows: [['Sam']] },
      categoryIds: ['cat-general'],
    });
    await renderInRouter(
      <CardEditor backHref="/i/i1" mode="edit" deck={deck} item={item} categories={categories} />,
    );
    expect(await screen.findByLabelText('Column 1 heading')).toHaveValue('Name');
    expect(screen.queryByDisplayValue('Milk')).toBeNull();
  });
});
