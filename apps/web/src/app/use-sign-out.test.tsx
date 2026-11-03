import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLeaveGuard } from '../editor/use-leave-guard';
import { renderInRouter } from '../test/render-in-router';
import { useSignOut } from './use-sign-out';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));

function DirtyEditor() {
  return useLeaveGuard({ when: true });
}

function SignOutButton() {
  const { signOut, signingOut } = useSignOut();
  return (
    <button type="button" onClick={signOut} disabled={signingOut}>
      Sign out
    </button>
  );
}

async function setup({ dirty = false } = {}) {
  const signOut = vi.fn(() => Promise.resolve());
  const view = await renderInRouter(
    <>
      <SignOutButton />
      {dirty && <DirtyEditor />}
    </>,
    { context: { signOut } },
  );
  return { ...view, signOut };
}

const button = () => screen.getByRole('button', { name: 'Sign out' });

describe('useSignOut (D276)', () => {
  it('signs out after leaving for the sign-in page', async () => {
    const { signOut, location } = await setup();
    fireEvent.click(button());
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(location()).toBe('/sign-in');
  });

  it('does not sign out while unsaved changes hold the page (Keep editing)', async () => {
    const { signOut, location } = await setup({ dirty: true });
    fireEvent.click(button());
    fireEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(signOut).not.toHaveBeenCalled();
    expect(location()).toBe('/here');
    expect(button()).toBeEnabled();
  });

  it('signs out once the changes are discarded', async () => {
    const { signOut, location } = await setup({ dirty: true });
    fireEvent.click(button());
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(location()).toBe('/sign-in');
  });
});
