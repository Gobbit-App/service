import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventCard } from './EventCard';
import type { EventCardPayload } from './payload-guards';

const NOW = new Date('2026-12-01T10:00:00Z');

const timed: EventCardPayload = {
  allDay: false,
  start: '2026-12-03T18:00:00Z',
  end: '2026-12-03T20:00:00Z',
  timeZone: 'UTC',
};

describe('EventCard (042)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the countdown, the span and no zone note in the event zone', () => {
    render(<EventCard payload={timed} viewerTimeZone="UTC" />);
    expect(screen.getByText('In 2 days · Thu 3 Dec, 18:00')).toBeInTheDocument();
    expect(screen.getByText('Thu 3 Dec, 18:00–20:00')).toBeInTheDocument();
    expect(screen.queryByText(/time$/)).not.toBeInTheDocument();
  });

  it("notes the event's own clock for a viewer in another zone", () => {
    render(<EventCard payload={{ ...timed, timeZone: 'Asia/Jerusalem' }} viewerTimeZone="UTC" />);
    expect(screen.getByText('20:00 Jerusalem time')).toBeInTheDocument();
  });

  it('shows the location and the link card', () => {
    render(
      <EventCard
        payload={{
          ...timed,
          location: 'Town hall',
          link: { url: 'https://example.org/fair', preview: { title: 'Fair' } },
        }}
        viewerTimeZone="UTC"
      />,
    );
    expect(screen.getByText('Town hall')).toBeInTheDocument();
    expect(screen.getByText('Fair')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open link' })).toHaveAttribute(
      'href',
      'https://example.org/fair',
    );
  });

  it('drops the link preview image when the card has a cover (044)', () => {
    const payload = {
      ...timed,
      link: {
        url: 'https://example.org/fair',
        preview: { title: 'Fair', image: 'https://example.org/og.png' },
      },
    };
    const { container, rerender } = render(<EventCard payload={payload} viewerTimeZone="UTC" />);
    expect(container.querySelector('.link-card__image')).not.toBeNull();
    rerender(<EventCard payload={payload} viewerTimeZone="UTC" showImage={false} />);
    expect(container.querySelector('.link-card__image')).toBeNull();
    expect(screen.getByText('Fair')).toBeInTheDocument();
    expect(screen.getByText('example.org')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open link' })).toBeInTheDocument();
  });

  it('shows an all-day range with the same dates for everyone', () => {
    render(
      <EventCard
        payload={{
          allDay: true,
          start: '2026-12-03',
          end: '2026-12-05',
          timeZone: 'Pacific/Auckland',
        }}
        viewerTimeZone="America/New_York"
      />,
    );
    expect(screen.getByText('Thu 3 – Sat 5 Dec')).toBeInTheDocument();
  });

  it('moves to "Happening now" and then "Ended" as the clock ticks', () => {
    vi.setSystemTime(new Date('2026-12-03T17:59:30Z'));
    render(<EventCard payload={timed} viewerTimeZone="UTC" />);
    expect(screen.getByText('Today · 18:00')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Happening now · until 20:00')).toBeInTheDocument();

    act(() => {
      vi.setSystemTime(new Date('2026-12-03T20:00:30Z'));
      vi.advanceTimersByTime(60_000);
    });
    const ended = screen.getByText('Ended · Thu 3 Dec');
    expect(ended).toHaveClass('event-status--muted');
  });
});
