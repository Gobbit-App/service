import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComingUpEntry } from '@gobbit/shared/reminders';
import { renderWithClient } from '../test/render';
import { ComingUp } from './ComingUp';

const NOW = new Date('2026-12-03T15:00:00Z');

const entry = (o: Partial<ComingUpEntry> = {}): ComingUpEntry => ({
  kind: 'event',
  itemId: '00000000-0000-4000-8000-000000000001',
  title: 'Choir concert',
  deck: { slug: 'home', name: 'Home' },
  startsAt: '2026-12-03T18:00:00.000Z',
  endsAt: '2026-12-03T20:00:00.000Z',
  allDay: false,
  timeZone: 'UTC',
  location: null,
  ...o,
});

describe('ComingUp (042, T073, D366)', () => {
  afterEach(() => vi.useRealTimers());

  it('renders nothing without entries', () => {
    const { container } = renderWithClient(<ComingUp entries={[]} viewerTimeZone="UTC" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the deck and start in the viewer zone, the location, and links to the card', () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const { navigate } = renderWithClient(
      <ComingUp entries={[entry({ location: 'Town hall' })]} viewerTimeZone="Europe/London" />,
    );
    expect(screen.getByRole('heading', { name: 'Coming up' })).toBeInTheDocument();
    expect(screen.getByText(/^Home · .*18:00/)).toBeInTheDocument();
    expect(screen.getByText('Town hall')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link'));
    expect(navigate).toHaveBeenCalledWith('/i/00000000-0000-4000-8000-000000000001');
  });

  it('keeps the server order (soonest first)', () => {
    renderWithClient(
      <ComingUp
        entries={[
          entry({ title: 'First' }),
          entry({ itemId: '00000000-0000-4000-8000-000000000002', title: 'Second' }),
        ]}
        viewerTimeZone="UTC"
      />,
    );
    const titles = screen.getAllByRole('link').map((l) => l.firstChild?.textContent);
    expect(titles).toEqual(['First', 'Second']);
  });
});
