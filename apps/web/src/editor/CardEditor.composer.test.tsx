import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requests, respond } from '../test/api-mock';
import { makeCategory, makeDeck, makeItem } from '../test/fixtures';
import type { memoryDraftsKv } from '../test/memory-drafts-kv';
import { renderInRouter } from '../test/render-in-router';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
vi.mock('./rich/RichBodyEditor', () => import('../test/rich-editor-mock'));
vi.mock('./drafts-store', async (importOriginal) => {
  const { memoryDraftsKv } = await import('../test/memory-drafts-kv');
  const kv = memoryDraftsKv();
  return { ...(await importOriginal<typeof import('./drafts-store')>()), idbDraftsKv: () => kv };
});
const { CardEditor } = await import('./CardEditor');
const { idbDraftsKv } = await import('./drafts-store');
const draftsKv = idbDraftsKv() as ReturnType<typeof memoryDraftsKv>;

const deck = makeDeck({ slug: 'family', name: 'Family' });
const categories = [makeCategory({ id: 'cat-general', name: 'General', isDefault: true })];

const renderCreate = () =>
  renderInRouter(
    <CardEditor
      backHref="/d/family"
      mode="create"
      deck={deck}
      type="text"
      categories={categories}
    />,
  );
const save = () => screen.getByRole('button', { name: 'Save' });
const typeTitle = (value: string) =>
  fireEvent.change(screen.getByLabelText('Title'), { target: { value } });

beforeEach(async () => {
  respond.mockReset();
  requests.mockReset();
  await draftsKv.clear();
});

describe('CardEditor: the composer frame (039)', () => {
  it('has its own top bar: Close, the heading with the deck, Save; no second heading', async () => {
    await renderCreate();
    expect(screen.getByRole('banner')).toContainElement(save());
    expect(screen.getByRole('heading', { level: 1, name: 'New card' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByRole('main')).toContainElement(screen.getByLabelText('Title'));
    expect(screen.getByRole('link', { name: 'Close' })).toHaveAttribute('href', '/d/family');
  });

  it('a fresh card stays quiet; a Save attempt reveals what to fix (D308)', async () => {
    await renderCreate();
    expect(screen.queryByText('Title is required')).not.toBeInTheDocument();
    expect(screen.getByText('Fix 1 field')).toHaveClass('visually-hidden');
    fireEvent.click(save());
    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(screen.getByText('Fix 1 field')).not.toHaveClass('visually-hidden');
    expect(requests).not.toHaveBeenCalledWith('POST /decks/{id}/items', expect.anything());
  });

  it('Ctrl+Enter saves the card like Save does (D310)', async () => {
    respond.mockResolvedValueOnce(makeItem());
    const { navigate } = await renderCreate();
    typeTitle('Plumber');
    fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Enter', ctrlKey: true });
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/d/family', { ignoreBlocker: true }),
    );
    expect(requests).toHaveBeenCalledWith('POST /decks/{id}/items', expect.anything());
  });

  it('Escape leaves through the guard: with changes it asks first (D310)', async () => {
    const { location } = await renderCreate();
    typeTitle('Unsaved');
    fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Escape' });
    await screen.findByRole('dialog', { name: 'Discard changes?' });
    // The open sheet owns Escape: it means Keep editing, not a second leave.
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(location()).toBe('/here');
  });

  it('Escape on an untouched card goes straight back', async () => {
    const { location } = await renderCreate();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await screen.findByText('Elsewhere');
    expect(location()).toBe('/d/family');
  });

  it('a refused save is announced at the top of the writing area', async () => {
    respond.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await renderCreate();
    typeTitle('Offline');
    fireEvent.click(save());
    const alert = await screen.findByRole('alert');
    expect(screen.getByRole('main').firstElementChild).toBe(alert);
  });
});
