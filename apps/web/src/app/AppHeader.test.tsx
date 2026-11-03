import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderInRouter } from '../test/render-in-router';
import { AppHeader } from './AppHeader';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));

async function setup(back: string | null) {
  return renderInRouter(<AppHeader title="Family" back={back} />);
}

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

  it('has no Settings or Sign out (D276: they live in the ⋯ menu)', async () => {
    await setup('/?all=true');
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });
});
