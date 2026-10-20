import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCategory } from '../test/fixtures';
import { testQueryClient } from '../test/render';
import { ApiError } from './api-error';
import { queryKeys } from './query-keys';

const { postMock, getMock } = vi.hoisted(() => ({ postMock: vi.fn(), getMock: vi.fn() }));
vi.mock('./client', () => ({
  api: { POST: postMock, GET: getMock },
  unwrap: (request: Promise<unknown>) => request,
}));
const { findSameCategory, nameToSlug, useCreateCategory } = await import('./create-category');

const deck = { id: 'd1', slug: 'family' };

function setup() {
  const queryClient = testQueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const { result } = renderHook(() => useCreateCategory(deck), { wrapper });
  return { invalidate, result };
}

beforeEach(() => {
  postMock.mockReset();
  getMock.mockReset();
});

describe('nameToSlug / findSameCategory', () => {
  it('slugs plain names like the API', () => {
    expect(nameToSlug('School')).toBe('school');
    expect(nameToSlug('  Café & Bakes ')).toBe('cafe-bakes');
  });

  it('matches by slug or by name, ignoring case', () => {
    const school = makeCategory({ id: 'c1', slug: 'school', name: 'School' });
    const odd = makeCategory({ id: 'c2', slug: 'x-1', name: 'Kids Stuff' });
    expect(findSameCategory([school, odd], 'SCHOOL')?.id).toBe('c1');
    expect(findSameCategory([school, odd], 'kids stuff')?.id).toBe('c2');
    expect(findSameCategory([school], 'Work')).toBeUndefined();
  });
});

describe('useCreateCategory', () => {
  it('posts the name and refetches the deck categories', async () => {
    const created = makeCategory({ id: 'c9', name: 'School', slug: 'school' });
    postMock.mockResolvedValueOnce(created);
    const { invalidate, result } = setup();

    result.current.mutate('School');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(postMock).toHaveBeenCalledWith('/decks/{id}/categories', {
      params: { path: { id: 'd1' } },
      body: { name: 'School' },
    });
    expect(result.current.data).toEqual({ category: created, existed: false });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.categories('d1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.categories('family') });
  });

  it('a 409 picks the existing category from a fresh list', async () => {
    const school = makeCategory({ id: 'c1', slug: 'school', name: 'School' });
    postMock.mockRejectedValueOnce(new ApiError(409, { status: 409, detail: 'Slug taken' }));
    getMock.mockResolvedValueOnce({ data: [school] });
    const { result } = setup();

    result.current.mutate('school');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ category: school, existed: true });
  });

  it('a 409 without a visible match fails with the problem', async () => {
    const conflict = new ApiError(409, { status: 409, detail: 'Slug taken' });
    postMock.mockRejectedValueOnce(conflict);
    getMock.mockResolvedValueOnce({ data: [] });
    const { result } = setup();

    result.current.mutate('Secret');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(conflict);
  });

  it('other failures are passed on without a refetch', async () => {
    postMock.mockRejectedValueOnce(new ApiError(403, { status: 403 }));
    const { result } = setup();
    result.current.mutate('School');
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getMock).not.toHaveBeenCalled();
  });
});
