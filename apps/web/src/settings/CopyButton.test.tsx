import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CopyButton } from './CopyButton';

describe('CopyButton', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('copies the value and shows Copied on success', async () => {
    const clipboard = { writeText: vi.fn(async () => {}) };
    render(<CopyButton value="v" label="Copy token" clipboard={clipboard} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy token' }));

    expect(await screen.findByText('Copied')).toBeInTheDocument();
    expect(clipboard.writeText).toHaveBeenCalledWith('v');
  });

  it('shows Copy failed when writeText rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const clipboard = {
      writeText: vi.fn(async () => {
        throw new Error('denied');
      }),
    };
    render(<CopyButton value="v" label="Copy token" clipboard={clipboard} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy token' }));

    expect(await screen.findByText('Copy failed')).toBeInTheDocument();
    expect(warn).toHaveBeenCalled();
  });
});
