import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requests, respond } from '../test/api-mock';
import { makeCategory, makeDeck, makeItem } from '../test/fixtures';
import type { memoryDraftsKv } from '../test/memory-drafts-kv';
import { renderInRouter } from '../test/render-in-router';
import { draftFromItem } from './draft';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
// jsdom has no IndexedDB: every draft goes to one in-memory store.
vi.mock('./drafts-store', async (importOriginal) => {
  const { memoryDraftsKv } = await import('../test/memory-drafts-kv');
  const kv = memoryDraftsKv();
  return { ...(await importOriginal<typeof import('./drafts-store')>()), idbDraftsKv: () => kv };
});
const { CardEditor } = await import('./CardEditor');
const { editDraftKey, idbDraftsKv, writeDraft } = await import('./drafts-store');
const draftsKv = idbDraftsKv() as ReturnType<typeof memoryDraftsKv>;

const deck = makeDeck({ slug: 'family' });
const categories = [makeCategory({ id: 'cat-general', name: 'General', isDefault: true })];
const item = makeItem({ id: 'i1', title: 'Old', categoryIds: ['cat-general'] });
const KEY = editDraftKey('i1');

const renderEdit = () =>
  renderInRouter(
    <CardEditor backHref="/i/i1" mode="edit" deck={deck} item={item} categories={categories} />,
  );
const typeTitle = (value: string) =>
  fireEvent.change(screen.getByLabelText('Title'), { target: { value } });
const cancel = () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

beforeEach(async () => {
  respond.mockReset();
  requests.mockReset();
  await draftsKv.clear();
});

describe('CardEditor: Cancel and the unsaved-changes guard (022)', () => {
  it('Cancel with no changes goes straight to the back target', async () => {
    const { location } = await renderEdit();
    cancel();
    await screen.findByText('Elsewhere');
    expect(location()).toBe('/i/i1');
  });

  it('a change undone back to the original does not ask', async () => {
    const { location } = await renderEdit();
    typeTitle('New');
    typeTitle('Old');
    cancel();
    await screen.findByText('Elsewhere');
    expect(location()).toBe('/i/i1');
  });

  it('Cancel with changes asks; Keep editing keeps the text and the address', async () => {
    const { location } = await renderEdit();
    typeTitle('New');
    cancel();
    await screen.findByRole('dialog', { name: 'Discard changes?' });
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(location()).toBe('/here');
    expect(screen.getByLabelText('Title')).toHaveValue('New');
  });

  it('asking writes the draft at once; Discard removes it and leaves', async () => {
    const { location } = await renderEdit();
    typeTitle('New');
    cancel();
    await screen.findByRole('dialog', { name: 'Discard changes?' });
    await waitFor(() => expect(draftsKv.map.has(KEY)).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await screen.findByText('Elsewhere');
    expect(location()).toBe('/i/i1');
    expect(draftsKv.map.has(KEY)).toBe(false);
    expect(requests).not.toHaveBeenCalledWith('PATCH /items/{id}', expect.anything());
  });

  it('an unanswered restore offer alone does not ask, and keeps the stored draft', async () => {
    await writeDraft(
      KEY,
      { ...draftFromItem(item), title: 'Mine' },
      item.updatedAt,
      new Date(),
      draftsKv,
    );
    const { location } = await renderEdit();
    await screen.findByText('Restore unsaved draft?');
    cancel();
    await screen.findByText('Elsewhere');
    expect(location()).toBe('/i/i1');
    expect(draftsKv.map.has(KEY)).toBe(true);
  });

  it('a successful save leaves without asking', async () => {
    respond.mockResolvedValueOnce({ ...item, title: 'New' });
    const { location } = await renderEdit();
    typeTitle('New');
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    await screen.findByText('Elsewhere');
    expect(location()).toBe('/i/i1');
  });

  it('writes the draft when the page is hidden', async () => {
    await renderEdit();
    typeTitle('New');
    window.dispatchEvent(new Event('pagehide'));
    await waitFor(() => expect(draftsKv.map.get(KEY)).toMatchObject({ draft: { title: 'New' } }));
  });
});

describe('CardEditor: instant category saves and the guard (022 + 023)', () => {
  const withMisc = [
    ...categories,
    makeCategory({ id: 'cat-misc', name: 'Misc', isDefault: false }),
  ];
  const renderWithMisc = () =>
    renderInRouter(
      <CardEditor backHref="/i/i1" mode="edit" deck={deck} item={item} categories={withMisc} />,
    );
  const tapMiscAndWaitForSave = async () => {
    respond.mockImplementation(async () => ({
      ...item,
      categoryIds: ['cat-general', 'cat-misc'],
      updatedAt: '2026-05-02T00:00:00.000Z',
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Misc' }));
    await waitFor(() =>
      expect(requests.mock.calls.some(([request]) => request === 'PATCH /items/{id}')).toBe(true),
    );
    // Let the save's answer land (the "Categories saved" toast needs the app's toast host).
    await new Promise((resolve) => setTimeout(resolve, 50));
  };

  it('a saved category change is not unsaved work: Cancel leaves without asking', async () => {
    const { location } = await renderWithMisc();
    await tapMiscAndWaitForSave();
    cancel();
    await screen.findByText('Elsewhere');
    expect(location()).toBe('/i/i1');
  });

  it('other unsaved edits still ask after a category save', async () => {
    await renderWithMisc();
    typeTitle('New');
    await tapMiscAndWaitForSave();
    cancel();
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
  });
});
