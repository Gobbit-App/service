import { act, fireEvent, render, screen } from '@testing-library/react';
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

  describe('generic event image (044, D396)', () => {
    const placeholder = (c: HTMLElement) => c.querySelector('.event-card__placeholder');
    const withImage = {
      ...timed,
      link: { url: 'https://example.org/fair', preview: { image: 'https://example.org/og.png' } },
    };

    it('shows the placeholder first when there is no link', () => {
      const { container } = render(<EventCard payload={timed} viewerTimeZone="UTC" />);
      expect(placeholder(container)).not.toBeNull();
      expect(container.querySelector('.event-card')!.firstElementChild).toBe(
        placeholder(container),
      );
    });

    it('shows the placeholder for a link without a preview image', () => {
      const payload = { ...timed, link: { url: 'https://example.org/fair' } };
      const { container } = render(<EventCard payload={payload} viewerTimeZone="UTC" />);
      expect(placeholder(container)).not.toBeNull();
    });

    it('shows no placeholder when the link has a preview image', () => {
      const { container } = render(<EventCard payload={withImage} viewerTimeZone="UTC" />);
      expect(placeholder(container)).toBeNull();
    });

    it('shows no placeholder when showImage is false', () => {
      const { container } = render(
        <EventCard payload={timed} viewerTimeZone="UTC" showImage={false} />,
      );
      expect(placeholder(container)).toBeNull();
    });

    it('shows the placeholder once the link image errors through to none', () => {
      const { container } = render(<EventCard payload={withImage} viewerTimeZone="UTC" />);
      fireEvent.error(container.querySelector('img.link-card__image')!);
      expect(placeholder(container)).not.toBeNull();
    });

    it('starts over when the preview image changes', () => {
      const { container, rerender } = render(
        <EventCard payload={withImage} viewerTimeZone="UTC" />,
      );
      fireEvent.error(container.querySelector('img.link-card__image')!);
      const next = {
        ...timed,
        link: { url: 'https://example.org/fair', preview: { image: 'https://example.org/b.png' } },
      };
      rerender(<EventCard payload={next} viewerTimeZone="UTC" />);
      expect(placeholder(container)).toBeNull();
    });

    it('hides the placeholder from assistive tech', () => {
      const { container } = render(<EventCard payload={timed} viewerTimeZone="UTC" />);
      expect(placeholder(container)).toHaveAttribute('aria-hidden', 'true');
    });
  });
});
