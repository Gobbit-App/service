import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FakeIntersectionObserver,
  installIntersectionObserver,
} from '../test/intersection-observer';
import { currentFromEntries, SETTLE_MS, useCurrentCard } from './use-current-card';

function Pages({ ids, initialId }: { ids: string[]; initialId: string | null }) {
  const container = useRef<HTMLDivElement>(null);
  const { currentId, settledId } = useCurrentCard({
    container,
    initialId,
    pagesKey: ids.join(','),
  });
  return (
    <>
      <div ref={container}>
        {ids.map((id) => (
          <section key={id} data-item-id={id} data-testid={`page-${id}`} />
        ))}
      </div>
      <output data-testid="current">{currentId}</output>
      <output data-testid="settled">{settledId}</output>
    </>
  );
}

const page = (id: string) => screen.getByTestId(`page-${id}`);
const text = (id: string) => screen.getByTestId(id).textContent;

describe('useCurrentCard', () => {
  beforeEach(() => {
    installIntersectionObserver();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('observes every page at threshold 0.6 with the container as root', () => {
    render(<Pages ids={['a', 'b', 'c']} initialId="a" />);
    const [observer] = FakeIntersectionObserver.instances;
    expect(observer.options?.threshold).toBe(0.6);
    expect(observer.options?.root).toBe(page('a').parentElement);
    expect(observer.observed.size).toBe(3);
  });

  it('sets the current id from the page that crosses the threshold', () => {
    render(<Pages ids={['a', 'b', 'c']} initialId="a" />);
    act(() => FakeIntersectionObserver.intersect(page('b'), 0.4));
    expect(text('current')).toBe('a');
    act(() => FakeIntersectionObserver.intersect(page('b'), 0.7));
    expect(text('current')).toBe('b');
  });

  it('settles 300 ms after the card stops changing', () => {
    render(<Pages ids={['a', 'b', 'c']} initialId="a" />);
    act(() => FakeIntersectionObserver.intersect(page('b'), 1));
    act(() => vi.advanceTimersByTime(SETTLE_MS - 50));
    act(() => FakeIntersectionObserver.intersect(page('c'), 1));
    act(() => vi.advanceTimersByTime(SETTLE_MS - 50));
    expect(text('settled')).toBe('a');
    act(() => vi.advanceTimersByTime(50));
    expect(text('settled')).toBe('c');
  });

  it('keeps the id when the list reorders or refetches', () => {
    const { rerender } = render(<Pages ids={['a', 'b', 'c']} initialId="a" />);
    act(() => FakeIntersectionObserver.intersect(page('b'), 1));
    rerender(<Pages ids={['c', 'x', 'b', 'a']} initialId="a" />);
    expect(text('current')).toBe('b');
    expect(FakeIntersectionObserver.instances[0].observed.size).toBe(4);
  });
});

describe('currentFromEntries', () => {
  const el = (id: string) => {
    const node = document.createElement('section');
    node.setAttribute('data-item-id', id);
    return node;
  };

  it('picks the most visible page over the threshold', () => {
    expect(
      currentFromEntries([
        { target: el('a'), isIntersecting: true, intersectionRatio: 0.65 },
        { target: el('b'), isIntersecting: true, intersectionRatio: 0.9 },
      ]),
    ).toBe('b');
    expect(
      currentFromEntries([{ target: el('a'), isIntersecting: false, intersectionRatio: 0 }]),
    ).toBeNull();
  });
});
