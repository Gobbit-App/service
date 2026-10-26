import { createMemoryHistory } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import { onArrival } from './on-arrival';

describe('onArrival', () => {
  it('runs once the next navigation lands on the path', () => {
    const history = createMemoryHistory({ initialEntries: ['/d/family'] });
    const run = vi.fn();
    onArrival(history, '/sign-in', run);
    history.push('/sign-in');
    history.push('/');
    history.push('/sign-in');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('is dropped by a navigation elsewhere', () => {
    const history = createMemoryHistory({ initialEntries: ['/d/family'] });
    const run = vi.fn();
    onArrival(history, '/sign-in', run);
    history.push('/settings');
    history.push('/sign-in');
    expect(run).not.toHaveBeenCalled();
  });

  it('can be cancelled before any navigation', () => {
    const history = createMemoryHistory({ initialEntries: ['/d/family'] });
    const run = vi.fn();
    const cancel = onArrival(history, '/sign-in', run);
    cancel();
    history.push('/sign-in');
    expect(run).not.toHaveBeenCalled();
  });

  it('waits for a held navigation until it is let through', async () => {
    const history = createMemoryHistory({ initialEntries: ['/i/i1/edit'] });
    let answer: (leave: boolean) => void = () => {};
    history.block({
      blockerFn: () => new Promise<boolean>((resolve) => (answer = (leave) => resolve(!leave))),
    });
    const run = vi.fn();
    onArrival(history, '/sign-in', run);
    history.push('/sign-in');
    expect(run).not.toHaveBeenCalled();
    answer(true);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });
});
