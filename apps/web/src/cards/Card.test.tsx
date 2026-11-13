import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCategory, makeItem } from '../test/fixtures';
import { renderWithClient } from '../test/render';

vi.mock('./use-cloud-name', () => ({ useCloudName: () => 'demo' }));
vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond: unwrap } = await import('../test/api-mock');
const { Card, itemCategories } = await import('./Card');

const school = makeCategory({ id: 'c-school', slug: 'school', name: 'School', isDefault: false });
const food = makeCategory({ id: 'c-food', slug: 'food', name: 'Food', isDefault: false });

describe('itemCategories', () => {
  it('keeps item order and drops categories the reader cannot see', () => {
    const item = makeItem({ categoryIds: ['c-food', 'c-hidden', 'c-school'] });
    expect(itemCategories(item, [school, food]).map((c) => c.slug)).toEqual(['food', 'school']);
  });
});

describe('Card', () => {
  const now = new Date('2026-03-01T00:00:00.000Z');

  it('shows title, chips and when it was added, and navigates in-app', () => {
    unwrap.mockReturnValue(new Promise(() => undefined));
    const item = makeItem({
      id: 'i1',
      title: 'Bus times',
      categoryIds: ['c-school'],
      createdAt: '2026-02-15T00:00:00.000Z',
      updatedAt: '2026-02-15T00:00:00.000Z',
    });
    const { navigate } = renderWithClient(
      <Card item={item} deckSlug="family" categories={[school]} now={now} />,
    );

    expect(screen.getByRole('article', { name: 'Bus times' })).toBeInTheDocument();
    expect(screen.getByText(/^Added 2 weeks ago$/)).toHaveAttribute(
      'datetime',
      '2026-02-15T00:00:00.000Z',
    );

    fireEvent.click(screen.getByRole('link', { name: 'School' }));
    expect(navigate).toHaveBeenCalledWith('/d/family/c/school');
    fireEvent.click(screen.getByRole('link', { name: 'Bus times' }));
    expect(navigate).toHaveBeenCalledWith('/i/i1');
  });

  it('hides the chips and age row when meta is off (D327)', () => {
    unwrap.mockReturnValue(new Promise(() => undefined));
    const item = makeItem({ title: 'Bus times', categoryIds: ['c-school'] });
    renderWithClient(
      <Card item={item} deckSlug="family" categories={[school]} now={now} meta={false} />,
    );
    expect(screen.getByRole('article', { name: 'Bus times' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Categories' })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Added /)).not.toBeInTheDocument();
  });

  it('renders a plain title when linkTitle is off', () => {
    unwrap.mockReturnValue(new Promise(() => undefined));
    renderWithClient(
      <Card
        item={makeItem({ title: 'Solo' })}
        deckSlug="family"
        categories={[]}
        linkTitle={false}
      />,
    );
    expect(screen.queryByRole('link', { name: 'Solo' })).not.toBeInTheDocument();
  });

  it('sends the favorite toggle', async () => {
    unwrap.mockResolvedValue(undefined);
    renderWithClient(
      <Card item={makeItem({ id: 'i1', isFavorite: false })} deckSlug="family" categories={[]} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
    await waitFor(() => expect(unwrap).toHaveBeenCalled());
  });

  it('preview hides favorite and share and renders title and chips without links', () => {
    unwrap.mockReturnValue(new Promise(() => undefined));
    renderWithClient(
      <Card
        item={makeItem({ id: 'preview', title: 'Draft', categoryIds: ['c-school'] })}
        deckSlug="family"
        categories={[school]}
        preview
      />,
    );
    expect(screen.getByRole('article', { name: 'Draft' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Categories' })).toHaveTextContent('School');
  });

  it('shows the source link button unless source is off', () => {
    unwrap.mockReturnValue(new Promise(() => undefined));
    const item = makeItem({ title: 'Soup', sourceUrl: 'https://example.com/soup' });
    const { unmount } = renderWithClient(
      <Card item={item} deckSlug="family" categories={[]} actions={false} />,
    );
    expect(screen.getByRole('link', { name: 'Source: example.com' })).toBeInTheDocument();
    unmount();
    renderWithClient(
      <Card item={item} deckSlug="family" categories={[]} actions={false} source={false} />,
    );
    expect(screen.queryByRole('link', { name: /^Source:/ })).not.toBeInTheDocument();
  });

  it('renders the same markup as before for cards without a cover, an imageless event adding only the generic image (SC-004, D396)', () => {
    unwrap.mockReturnValue(new Promise(() => undefined));
    const text = makeItem({
      id: 'snap-text',
      title: 'Bus times',
      body: 'Leaves at 8',
      categoryIds: ['c-school'],
      createdAt: '2026-02-15T00:00:00.000Z',
      updatedAt: '2026-02-15T00:00:00.000Z',
    });
    const event = makeItem({
      id: 'snap-event',
      type: 'event',
      title: 'Party',
      body: '',
      payload: {
        allDay: false,
        start: '2026-12-03T18:00:00Z',
        end: '2026-12-03T20:00:00Z',
        timeZone: 'UTC',
      },
      createdAt: '2026-02-15T00:00:00.000Z',
      updatedAt: '2026-02-15T00:00:00.000Z',
    });
    const { container, unmount } = renderWithClient(
      <Card item={text} deckSlug="family" categories={[school]} now={now} />,
    );
    expect(container.innerHTML).toMatchInlineSnapshot(
      `"<article class="card" aria-labelledby="card-title-snap-text"><header class="card__header"><h2 class="card__title" id="card-title-snap-text" dir="auto"><a href="/i/snap-text"><span>Bus times</span></a></h2></header><div class="card__body"><div class="text-card rt-flow"><p dir="auto">Leaves at 8</p></div></div><footer class="card__meta"><ul class="card__chips" aria-label="Categories"><li><a href="/d/family/c/school" class="chip chip--small">School</a></li></ul><time class="card__age" datetime="2026-02-15T00:00:00.000Z" title="15.2.2026, 2:00:00">Added 2 weeks ago</time></footer><div class="card__bar" role="group" aria-label="Card actions"><button type="button" class="icon-button favorite-button" aria-label="Add to favorites" aria-pressed="false" data-tip="Add to favorites"><svg class="icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3.5L14.6 8.8L20.5 9.7L16.25 13.8L17.25 19.6L12 16.9L6.75 19.6L7.75 13.8L3.5 9.7L9.4 8.8Z"></path></svg></button><span class="share-button-wrap"><button type="button" class="icon-button share-button" aria-label="Share" data-tip="Share"><svg class="icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3V15M8 7L12 3L16 7M5 12V19A2 2 0 0 0 7 21H17A2 2 0 0 0 19 19V12"></path></svg></button></span></div></article>"`,
    );
    unmount();
    const second = renderWithClient(
      <Card item={event} deckSlug="family" categories={[]} now={now} />,
    );
    expect(second.container.innerHTML).toMatchInlineSnapshot(
      `"<article class="card" aria-labelledby="card-title-snap-event"><header class="card__header"><h2 class="card__title" id="card-title-snap-event" dir="auto"><a href="/i/snap-event"><span>Party</span></a></h2></header><div class="card__body"><div class="event-card"><div class="event-card__placeholder" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 6H20V20H4Z M4 10H20 M8 3.5V7.5M16 3.5V7.5"></path></svg></div><p class="event-status">Thu 3 Dec, 20:00</p><p class="event-when">Thu 3 Dec, 20:00–22:00</p><p class="event-zone">18:00 UTC time</p></div></div><footer class="card__meta"><time class="card__age" datetime="2026-02-15T00:00:00.000Z" title="15.2.2026, 2:00:00">Added 2 weeks ago</time></footer><div class="card__bar" role="group" aria-label="Card actions"><button type="button" class="icon-button favorite-button" aria-label="Add to favorites" aria-pressed="false" data-tip="Add to favorites"><svg class="icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3.5L14.6 8.8L20.5 9.7L16.25 13.8L17.25 19.6L12 16.9L6.75 19.6L7.75 13.8L3.5 9.7L9.4 8.8Z"></path></svg></button><span class="share-button-wrap"><button type="button" class="icon-button share-button" aria-label="Share" data-tip="Share"><svg class="icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3V15M8 7L12 3L16 7M5 12V19A2 2 0 0 0 7 21H17A2 2 0 0 0 19 19V12"></path></svg></button></span></div></article>"`,
    );
  });

  it('renders the cover bar between the header and the body (D391)', () => {
    unwrap.mockReturnValue(new Promise(() => undefined));
    const item = makeItem({
      title: 'Soup',
      cover: { publicId: 'gobbit/items/d/cover', width: 1200, height: 300 },
    });
    const { container } = renderWithClient(
      <Card item={item} deckSlug="family" categories={[]} now={now} />,
    );
    const cover = container.querySelector('.card__cover');
    const header = container.querySelector('header.card__header');
    expect(cover).toBeInTheDocument();
    expect(header?.nextElementSibling).toBe(cover);
  });
});
