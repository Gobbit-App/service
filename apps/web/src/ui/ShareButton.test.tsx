import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from '@testing-library/react';
import { ShareButton } from './ShareButton';
import type { ShareNavigator } from '../lib/share';

describe('ShareButton', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls share method with url and title, no toast', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const nav: ShareNavigator = { share };
    const user = userEvent.setup();

    render(<ShareButton itemId="test-id" title="Test Item" origin="https://g.test" nav={nav} />);

    await user.click(screen.getByRole('button'));

    expect(share).toHaveBeenCalledOnce();
    expect(share).toHaveBeenCalledWith({
      url: 'https://g.test/s/test-id',
      title: 'Test Item',
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('calls clipboard.writeText and shows "Link copied" toast', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    const nav: ShareNavigator = { clipboard: { writeText } };
    const user = userEvent.setup();

    render(<ShareButton itemId="test-id" title="Test Item" origin="https://g.test" nav={nav} />);

    await user.click(screen.getByRole('button'));

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith('https://g.test/s/test-id');
    expect(screen.getByRole('status')).toHaveTextContent('Link copied');

    act(() => vi.advanceTimersByTime(2500));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows error toast when nav has neither share nor clipboard', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const nav: ShareNavigator = {};
    const user = userEvent.setup();

    render(<ShareButton itemId="test-id" title="Test Item" origin="https://g.test" nav={nav} />);

    await user.click(screen.getByRole('button'));

    expect(screen.getByRole('status')).toHaveTextContent("Couldn't share this card");

    act(() => vi.advanceTimersByTime(2500));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not show toast when share rejects with AbortError', async () => {
    const error = Object.assign(new Error('aborted'), {
      name: 'AbortError',
    });
    const share = vi.fn().mockRejectedValue(error);
    const nav: ShareNavigator = { share };
    const user = userEvent.setup();

    render(<ShareButton itemId="test-id" title="Test Item" origin="https://g.test" nav={nav} />);

    await user.click(screen.getByRole('button'));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
