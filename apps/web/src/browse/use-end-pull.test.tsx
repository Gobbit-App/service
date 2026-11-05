import { fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { END_PULL_PX, pullDirection, useEndPull, type PullDirection } from './use-end-pull';

describe('pullDirection', () => {
  it('reads a long sideways pull (ltr track)', () => {
    expect(pullDirection(-END_PULL_PX, 0)).toBe('next');
    expect(pullDirection(END_PULL_PX + 10, 5)).toBe('prev');
  });

  it('ignores short and mostly vertical moves', () => {
    expect(pullDirection(-(END_PULL_PX - 1), 0)).toBeNull();
    expect(pullDirection(-60, 80)).toBeNull();
    expect(pullDirection(60, 60)).toBeNull();
  });
});

function Track({
  hasPrev,
  hasNext,
  onEnd,
}: {
  hasPrev: boolean;
  hasNext: boolean;
  onEnd: (direction: PullDirection) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  useEndPull(track, { hasPrev, hasNext, onEnd });
  return (
    <div ref={track} data-testid="track">
      <div data-testid="page" />
      <div className="table-card" data-testid="table" />
      <div className="browse-edge" data-testid="edge" />
    </div>
  );
}

function pull(element: Element, dx: number, dy = 0) {
  fireEvent.touchStart(element, { touches: [{ clientX: 200, clientY: 300 }] });
  fireEvent.touchEnd(element, { changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }] });
}

describe('useEndPull', () => {
  it('reports a pull past the last or first category only', () => {
    const onEnd = vi.fn();
    const { getByTestId, rerender } = render(<Track hasPrev hasNext={false} onEnd={onEnd} />);
    pull(getByTestId('page'), -80);
    expect(onEnd).toHaveBeenLastCalledWith('next');
    pull(getByTestId('page'), 80);
    expect(onEnd).toHaveBeenCalledTimes(1);

    rerender(<Track hasPrev={false} hasNext onEnd={onEnd} />);
    pull(getByTestId('page'), 80);
    expect(onEnd).toHaveBeenLastCalledWith('prev');
    expect(onEnd).toHaveBeenCalledTimes(2);
  });

  it('ignores pulls that start on a wide table or a side strip', () => {
    const onEnd = vi.fn();
    const { getByTestId } = render(<Track hasPrev={false} hasNext={false} onEnd={onEnd} />);
    pull(getByTestId('table'), -80);
    pull(getByTestId('edge'), 80);
    pull(getByTestId('page'), -20);
    expect(onEnd).not.toHaveBeenCalled();
  });
});
