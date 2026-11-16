import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testQueryClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond } = await import('../test/api-mock');
const { useMemberName, SOMEONE } = await import('./use-member-name');

const members = [{ userId: 'u2', displayName: 'Dana Levi', email: null, username: 'dana' }];

function setup() {
  respond.mockImplementation(async (request) => {
    if (request === 'GET /me') return { user: { id: 'u1' } };
    if (request === 'GET /decks/{id}/members') return { data: members };
    throw new Error(`unexpected ${request}`);
  });
  const client = testQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useMemberName('family', true), { wrapper });
}

describe('useMemberName', () => {
  beforeEach(() => {
    respond.mockReset();
  });

  it('names the viewer "you", members by profile name, others "someone"', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current('u2')).toBe('Dana Levi'));
    expect(result.current('u1')).toBe('you');
    expect(result.current('gone')).toBe(SOMEONE);
    expect(result.current(null)).toBe(SOMEONE);
  });
});
