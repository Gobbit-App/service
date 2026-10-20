import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-error';
import { requests, respond } from '../test/api-mock';
import { makeCategory, makeDeck, makeItem } from '../test/fixtures';
import type { memoryDraftsKv } from '../test/memory-drafts-kv';
import { emptyDraft, withType } from './draft';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
// jsdom has no IndexedDB: every draft goes to one in-memory store.
vi.mock('./drafts-store', async (importOriginal) => {
  const { memoryDraftsKv } = await import('../test/memory-drafts-kv');
  const kv = memoryDraftsKv();
  return { ...(await importOriginal<typeof import('./drafts-store')>()), idbDraftsKv: () => kv };
});
const { CardEditor } = await import('./CardEditor');
const { editDraftKey, idbDraftsKv, newDraftKey, writeDraft } = await import('./drafts-store');
const draftsKv = idbDraftsKv() as MemoryDraftsKv;

const deck = makeDeck({ slug: 'family' });
const categories = [
  makeCategory({ id: 'cat-misc', slug: 'misc', name: 'Misc', isDefault: false }),
  makeCategory({ id: 'cat-general', slug: 'general', name: 'General', isDefault: true }),
];

function renderCreate(type: 'text' | 'link' = 'text', onTypeChange = vi.fn()) {
  const view = renderWithClient(
    <CardEditor
      mode="create"
      deck={deck}
      type={type}
      categories={categories}
      onTypeChange={onTypeChange}
    />,
  );
  return { ...view, onTypeChange };
}

const saveButton = () => screen.getByRole('button', { name: 'Save card' });
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const bodyOf = (request: string) =>
  (requests.mock.calls.find(([r]) => r === request)?.[1] as { body: unknown } | undefined)?.body;

type MemoryDraftsKv = ReturnType<typeof memoryDraftsKv>;

beforeEach(async () => {
  respond.mockReset();
  requests.mockReset();
  await draftsKv.clear();
});

describe('CardEditor: create', () => {
  it('preselects the default category and saves a text card, then opens the deck', async () => {
    respond.mockResolvedValueOnce(makeItem());
    const { navigate } = renderCreate();

    expect(screen.getByRole('button', { name: 'General' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Misc' })).toHaveAttribute('aria-pressed', 'false');
    type('Title', 'Plumber');
    type('Body', 'Call Sam');
    fireEvent.click(saveButton());

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/d/family'));
    expect(bodyOf('POST /decks/{id}/items')).toEqual({
      type: 'text',
      title: 'Plumber',
      body: 'Call Sam',
      payload: {},
      categoryIds: ['cat-general'],
    });
  });

  it('shows "New card" and a type picker that keeps the title when switching', () => {
    const { onTypeChange } = renderCreate();
    expect(screen.getByRole('heading', { name: 'New card' })).toBeInTheDocument();
    type('Title', 'Recipe');
    fireEvent.click(screen.getByRole('radio', { name: 'Link' }));
    expect(onTypeChange).toHaveBeenCalledWith('link');
    expect(screen.getByLabelText('URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Recipe');
  });

  it('saves a link card with its url and preview text', async () => {
    respond.mockResolvedValueOnce(makeItem());
    renderCreate('link');
    type('Title', 'Recipe');
    type('URL', 'https://example.com/pie');
    type('Preview title', 'Pie');
    fireEvent.click(saveButton());

    await waitFor(() => expect(bodyOf('POST /decks/{id}/items')).toBeDefined());
    expect(bodyOf('POST /decks/{id}/items')).toMatchObject({
      type: 'link',
      payload: { url: 'https://example.com/pie', preview: { title: 'Pie' } },
    });
  });

  it('disables Save over 600 body code points and says why', () => {
    renderCreate();
    type('Title', 'Long');
    type('Body', '😀'.repeat(601));
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Fix 1 field')).toBeInTheDocument();
    expect(screen.getByLabelText('Body')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('601 / 600 characters')).toBeInTheDocument();
  });

  it('disables Save with no category', () => {
    renderCreate();
    type('Title', 'No category');
    fireEvent.click(screen.getByRole('button', { name: 'General' }));
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Pick at least one category')).toBeInTheDocument();
  });

  it('shows a server 422 on the categories and keeps the draft', async () => {
    respond.mockRejectedValueOnce(
      new ApiError(422, {
        type: '/problems/item-needs-category',
        title: 'Item needs a category',
        status: 422,
      }),
    );
    const { navigate } = renderCreate();
    type('Title', 'Kept');
    fireEvent.click(saveButton());

    expect(await screen.findByText('Pick at least one category')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Kept');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('maps a validation problem to the field it names', async () => {
    respond.mockRejectedValueOnce(
      new ApiError(400, {
        type: '/problems/validation',
        title: 'Validation failed',
        status: 400,
        errors: [{ path: 'title', message: 'Title is taken' }],
      }),
    );
    renderCreate();
    type('Title', 'Dup');
    fireEvent.click(saveButton());
    expect(await screen.findByText('Title is taken')).toBeInTheDocument();
  });

  it('renders the draft in the preview card', () => {
    renderCreate();
    type('Title', 'Preview me');
    const preview = screen.getByRole('region', { name: 'Preview', hidden: true });
    expect(preview).toHaveTextContent('Preview me');
    expect(preview.querySelector('a')).toBeNull();
  });
});

describe('CardEditor: edit', () => {
  const item = makeItem({
    id: 'i1',
    type: 'link',
    title: 'Old',
    payload: { url: 'https://a.example/' },
    categoryIds: ['cat-general'],
    entities: { phones: ['555-1234'] },
  });

  function renderEdit(from?: 'review', base = item) {
    return renderWithClient(
      <CardEditor mode="edit" deck={deck} item={base} categories={categories} from={from} />,
    );
  }

  it('shows the type as a label, not a picker', () => {
    renderEdit();
    expect(screen.getByRole('heading', { name: 'Edit card' })).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByText('Link')).toBeInTheDocument();
  });

  it('sends only the changed title and returns to the card', async () => {
    respond.mockResolvedValueOnce({ ...item, title: 'New' });
    const { navigate } = renderEdit();
    type('Title', 'New');
    fireEvent.click(saveButton());

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/i/i1'));
    expect(bodyOf('PATCH /items/{id}')).toEqual({ title: 'New' });
  });

  it('saves nothing when unchanged and goes back', async () => {
    const { navigate } = renderEdit();
    fireEvent.click(saveButton());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/i/i1'));
    expect(requests).not.toHaveBeenCalledWith('PATCH /items/{id}', expect.anything());
  });

  it('returns to the review queue for a proposal opened from review', async () => {
    const proposal = { ...item, status: 'proposed' as const };
    respond.mockResolvedValueOnce({ ...proposal, title: 'New' });
    const { navigate } = renderEdit('review', proposal);
    type('Title', 'New');
    fireEvent.click(saveButton());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/d/family/review'));
  });

  it('removes an extracted detail and sends the remaining entities', async () => {
    respond.mockResolvedValueOnce(item);
    renderEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Phone 555-1234' }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(bodyOf('PATCH /items/{id}')).toEqual({ entities: {} }));
  });
});

describe('CardEditor: unsaved drafts (D145)', () => {
  const STAMP = new Date('2026-05-01T10:00:00.000Z');
  const newKey = () => newDraftKey(deck.id, 'text');

  it('autosaves while typing and offers the draft when reopened', async () => {
    const first = renderCreate();
    type('Title', 'Half-written');
    await waitFor(() => expect(draftsKv.map.has(newKey())).toBe(true));
    first.unmount();

    renderCreate();
    expect(await screen.findByText('Restore unsaved draft?')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(screen.getByLabelText('Title')).toHaveValue('Half-written');
    expect(screen.queryByText('Restore unsaved draft?')).toBeNull();
  });

  it('restoring a draft of another type switches the picker and the URL', async () => {
    const draft = { ...withType(emptyDraft('text', 'cat-general'), 'link'), title: 'Saved link' };
    await writeDraft(newKey(), draft, null, STAMP, draftsKv);
    const { onTypeChange } = renderCreate();
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    expect(onTypeChange).toHaveBeenCalledWith('link');
    expect(screen.getByLabelText('URL')).toBeInTheDocument();
  });

  it('Discard starts fresh and forgets the draft', async () => {
    await writeDraft(
      newKey(),
      { ...emptyDraft('text', 'cat-general'), title: 'Old' },
      null,
      STAMP,
      draftsKv,
    );
    renderCreate();
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('status', { name: /restore/i })).toBeNull();
    expect(screen.getByLabelText('Title')).toHaveValue('');
    await waitFor(() => expect(draftsKv.map.has(newKey())).toBe(false));
  });

  it('warns when the card changed since the draft began', async () => {
    const item = makeItem({ id: 'i9', title: 'Server', updatedAt: '2026-05-02T00:00:00.000Z' });
    const { draftFromItem } = await import('./draft');
    await writeDraft(
      editDraftKey('i9'),
      { ...draftFromItem(item), title: 'Mine' },
      '2026-05-01T00:00:00.000Z',
      STAMP,
      draftsKv,
    );
    renderWithClient(<CardEditor mode="edit" deck={deck} item={item} categories={categories} />);
    expect(
      await screen.findByText(
        'This card has changed since — restoring will overwrite those changes when you save.',
      ),
    ).toBeInTheDocument();
  });

  it('a successful save removes the draft', async () => {
    respond.mockResolvedValueOnce(makeItem());
    const { navigate } = renderCreate();
    type('Title', 'Plumber');
    await waitFor(() => expect(draftsKv.map.has(newKey())).toBe(true));
    fireEvent.click(saveButton());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/d/family'));
    expect(draftsKv.map.has(newKey())).toBe(false);
  });
});
