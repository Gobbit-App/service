import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderInRouter } from '../test/render-in-router';
import { NavLink } from '../ui/NavLink';
import { useLeaveGuard, type LeaveGuardOptions } from './use-leave-guard';

function Editor({ onAttempt, onDiscard }: Omit<LeaveGuardOptions, 'when'>) {
  const [text, setText] = useState('');
  const dialog = useLeaveGuard({ when: text !== '', onAttempt, onDiscard });
  return (
    <>
      <label>
        Title
        <input value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <NavLink href="/elsewhere">Leave</NavLink>
      {dialog}
    </>
  );
}

async function setup(options: { browser?: boolean } = {}) {
  const onAttempt = vi.fn();
  const onDiscard = vi.fn();
  const view = await renderInRouter(
    <Editor onAttempt={onAttempt} onDiscard={onDiscard} />,
    options,
  );
  return { ...view, onAttempt, onDiscard };
}

const typeTitle = (value: string) =>
  fireEvent.change(screen.getByLabelText('Title'), { target: { value } });
const leave = () => fireEvent.click(screen.getByRole('link', { name: 'Leave' }));

describe('useLeaveGuard', () => {
  it('lets an unchanged screen leave without asking', async () => {
    const { location, onAttempt } = await setup();
    leave();
    await screen.findByText('Elsewhere');
    expect(location()).toBe('/elsewhere');
    expect(onAttempt).not.toHaveBeenCalled();
  });

  it('holds the navigation while changed and asks; Keep editing stays', async () => {
    const { location, onAttempt, onDiscard } = await setup();
    typeTitle('Plumber');
    leave();
    await screen.findByRole('dialog', { name: 'Discard changes?' });
    expect(onAttempt).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(location()).toBe('/here');
    expect(screen.getByLabelText('Title')).toHaveValue('Plumber');
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('Discard runs onDiscard, then the navigation continues', async () => {
    const { location, onDiscard } = await setup();
    typeTitle('Plumber');
    leave();
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await screen.findByText('Elsewhere');
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(location()).toBe('/elsewhere');
  });

  it('still leaves when onDiscard fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = await renderInRouter(
      <Editor onDiscard={() => Promise.reject(new Error('idb down'))} />,
    );
    typeTitle('Plumber');
    leave();
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await screen.findByText('Elsewhere');
    expect(view.location()).toBe('/elsewhere');
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('does not hold a navigation that ignores the blocker (after a save)', async () => {
    const { navigate, location } = await setup();
    typeTitle('Plumber');
    act(() => navigate('/saved', { ignoreBlocker: true }));
    await screen.findByText('Elsewhere');
    expect(location()).toBe('/saved');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks the browser before unload only while changed', async () => {
    const { unmount } = await setup({ browser: true });
    const unchanged = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unchanged);
    expect(unchanged.defaultPrevented).toBe(false);

    typeTitle('Plumber');
    await act(async () => {});
    const changed = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(changed);
    expect(changed.defaultPrevented).toBe(true);
    unmount();
  });
});
