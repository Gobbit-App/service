import { render, screen } from '@testing-library/react';
import type { ItemEvent } from '@pb/shared';
import { describe, expect, it } from 'vitest';
import { itemEventKinds } from '@pb/shared/events';
import { EventRow } from './EventRow';
import { eventLabel } from './event-copy';

const NOW = new Date('2026-10-24T12:00:00.000Z');

function event(over: Partial<ItemEvent> = {}): ItemEvent {
  return {
    id: 'e1',
    itemId: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Plumber',
    kind: 'updated',
    via: 'session',
    actor: { userId: 'u1', displayName: 'Maya' },
    changes: ['title', 'body'],
    createdAt: '2026-10-24T11:00:00.000Z',
    ...over,
  };
}

const renderRow = (e: ItemEvent) =>
  render(
    <ul>
      <EventRow event={e} now={NOW} />
    </ul>,
  );

describe('EventRow (D188)', () => {
  it('has a label for every kind', () => {
    for (const kind of itemEventKinds) expect(eventLabel(kind)).toMatch(/\S/);
  });

  it('shows the action, a card link, changed fields, person and time', () => {
    renderRow(event());
    expect(screen.getByText('Edited')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Plumber' })).toHaveAttribute(
      'href',
      '/i/550e8400-e29b-41d4-a716-446655440000',
    );
    expect(screen.getByText(/title, text/)).toBeInTheDocument();
    expect(screen.getByText('Maya')).toBeInTheDocument();
    expect(screen.getByText('1 hour ago')).toBeInTheDocument();
    expect(screen.queryByText('via share/import')).not.toBeInTheDocument();
  });

  it('reads "Former member" for a deleted account', () => {
    renderRow(event({ actor: null }));
    expect(screen.getByText('Former member')).toBeInTheDocument();
  });

  it('badges proposals from a share', () => {
    renderRow(event({ kind: 'proposed', via: 'ingest', changes: [] }));
    expect(screen.getByText('Proposed')).toBeInTheDocument();
    expect(screen.getByText('via share/import')).toBeInTheDocument();
  });

  it('has no link once the card is purged', () => {
    renderRow(event({ kind: 'deleted', itemId: null, changes: [] }));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Plumber')).toBeInTheDocument();
  });
});
