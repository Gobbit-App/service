import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderInRouter } from '../test/render-in-router';
import { Route } from './auth.error';

function renderReason(reason: string) {
  vi.spyOn(Route, 'useSearch').mockReturnValue({ reason } as never);
  const Page = Route.options.component as () => React.ReactElement;
  return renderInRouter(<Page />);
}

describe('auth error route', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['closed', 'invite_gone'])('should offer the waitlist for "%s"', async (reason) => {
    await renderReason(reason);
    expect(screen.getByRole('link', { name: 'Join the waitlist' }).getAttribute('href')).toBe(
      '/welcome',
    );
  });

  it('should not offer the waitlist for "expired"', async () => {
    await renderReason('expired');
    expect(screen.queryByRole('link', { name: 'Join the waitlist' })).toBeNull();
  });
});
