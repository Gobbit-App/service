import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLeaveGuard } from '../editor/use-leave-guard';
import { renderInRouter } from '../test/render-in-router';
import { AppHeader } from './AppHeader';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));

function DirtyEditor() {
  return useLeaveGuard({ when: true });
}

async function setup(back: string | null, { dirty = false } = {}) {
  const signOut = vi.fn(() => Promise.resolve());
  const view = await renderInRouter(
    <>
      <AppHeader title="Family" back={back} />
      {dirty && <DirtyEditor />}
    </>,
    { context: { signOut } },
  );
  return { ...view, signOut };
}

const signOutButton = () => screen.getByRole('button', { name: 'Sign out' });

describe('AppHeader', () => {
  it('links back one level', async () => {
    await setup('/?all=true');
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/?all=true');
  });

  it('has no back control on the deck list', async () => {
    await setup(null);
    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Family' })).toBeInTheDocument();
  });

  it('signs out after leaving for the sign-in page', async () => {
    const { signOut, location } = await setup(null);
    fireEvent.click(signOutButton());
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(location()).toBe('/sign-in');
  });

  it('does not sign out while unsaved changes hold the page (Keep editing)', async () => {
    const { signOut, location } = await setup(null, { dirty: true });
    fireEvent.click(signOutButton());
    fireEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(signOut).not.toHaveBeenCalled();
    expect(location()).toBe('/here');
    expect(signOutButton()).toBeEnabled();
    expect(signOutButton().querySelector('svg')).not.toBeNull();
  });

  it('signs out once the changes are discarded', async () => {
    const { signOut, location } = await setup(null, { dirty: true });
    fireEvent.click(signOutButton());
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(location()).toBe('/sign-in');
  });
});
