import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemType } from '@gobbit/shared';
import { ApiError } from '../api/api-error';
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

const renderCreate = (type: ItemType = 'text') =>
  renderInRouter(
    <CardEditor
      backHref="/d/family"
      mode="create"
      deck={deck}
      type={type}
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
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
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

describe('CardEditor: the canvas (039 PR3)', () => {
  // The canvas sections in document order (the preview is hidden in tests: no layout CSS).
  const regionNames = () =>
    screen.getAllByRole('region').map((region) => region.querySelector('h2')?.textContent);

  it('a text card is title, body, then Details (D306)', async () => {
    await renderCreate();
    expect(regionNames()).toEqual(['Details']);
    const details = screen.getByRole('region', { name: 'Details' });
    const title = screen.getByLabelText('Title');
    expect(title.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a link card leads with its URL, above the title (D306)', async () => {
    await renderCreate('link');
    const link = await screen.findByRole('region', { name: 'Link' });
    const title = screen.getByLabelText('Title');
    expect(link.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(regionNames()).toEqual(['Link', 'Details']);
  });

  it('a table card puts its section after the body, titled by the type (D306)', async () => {
    await renderCreate('table');
    const table = await screen.findByRole('region', { name: 'Table' });
    const body = screen.getByLabelText('Body');
    expect(body.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a blocked Save lands on the first invalid field (D308)', async () => {
    await renderCreate();
    fireEvent.click(save());
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveFocus());
  });

  it('a save the server refused lands on the field it named (D308)', async () => {
    respond.mockRejectedValueOnce(
      new ApiError(400, {
        type: '/problems/validation',
        title: 'Validation failed',
        status: 400,
        errors: [{ path: 'title', message: 'Title is taken' }],
      }),
    );
    await renderCreate();
    typeTitle('Dup');
    save().focus();
    fireEvent.click(save());
    await screen.findByText('Title is taken');
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveFocus());
  });

  it('Preview swaps the canvas for the preview; leaving restores focus (D309)', async () => {
    await renderCreate();
    const toggle = screen.getByRole('button', { name: 'Preview' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    typeTitle('Look');
    screen.getByLabelText('Title').focus();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Preview' })).toHaveTextContent('Look');
    expect(screen.getByLabelText('Title').closest('[hidden]')).not.toBeNull();

    // Escape leaves the preview first, not the composer.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveFocus());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a blocked Save from the preview returns to the canvas (D308, D309)', async () => {
    await renderCreate();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    fireEvent.click(save());
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
