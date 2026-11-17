import { useState } from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-error';
import { mockConfig, requests, respond } from '../test/api-mock';
import type { memoryDraftsKv } from '../test/memory-drafts-kv';
import { renderInRouter } from '../test/render-in-router';
import type { SavedProfile } from './ProfileForm';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
vi.mock('../editor/drafts-store', async (importOriginal) => {
  const { memoryDraftsKv } = await import('../test/memory-drafts-kv');
  const kv = memoryDraftsKv();
  return {
    ...(await importOriginal<typeof import('../editor/drafts-store')>()),
    idbDraftsKv: () => kv,
  };
});
const { ProfileForm, PROFILE_COPY, PROFILE_DRAFT_KEY } = await import('./ProfileForm');
const { idbDraftsKv } = await import('../editor/drafts-store');
const kv = idbDraftsKv() as ReturnType<typeof memoryDraftsKv>;

const EMPTY: SavedProfile = {
  username: null,
  firstName: null,
  lastName: null,
  location: null,
  avatar: null,
};
const SAVED: SavedProfile = { ...EMPTY, firstName: 'Dana', location: 'Haifa' };
const EMAIL = 'secret.person@example.com';

const render = (profile = SAVED) =>
  renderInRouter(<ProfileForm userId="u1" email={EMAIL} profile={profile} />);
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const patches = () => requests.mock.calls.filter(([r]) => r === 'PATCH /me/profile');

beforeEach(async () => {
  respond.mockReset();
  requests.mockClear();
  await kv.clear();
});

describe('ProfileForm (046)', () => {
  it('loads values, hints at email-only lookup when no username, never shows the email', async () => {
    await render(EMPTY);
    for (const label of ['First name', 'Last name', 'Username', 'Location']) {
      expect(screen.getByLabelText(label)).toHaveValue('');
    }
    expect(screen.getByText(PROFILE_COPY.usernameHint)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(EMAIL);
    expect(document.body.textContent).not.toContain('secret');
    expect(screen.getByRole('img', { name: /your avatar/i })).toHaveTextContent('SP');
  });

  it('fills in when the fresh profile arrives after a stale one, keeping touched fields', async () => {
    let setProfile: (p: SavedProfile) => void = () => undefined;
    function Late() {
      const [profile, set] = useState<SavedProfile>(EMPTY);
      setProfile = set;
      return <ProfileForm userId="u1" email={EMAIL} profile={profile} />;
    }
    await renderInRouter(<Late />);
    expect(screen.getByLabelText('First name')).toHaveValue('');
    type('Location', 'Eilat');
    act(() => setProfile({ ...EMPTY, firstName: 'Smoke', location: 'Haifa' }));
    await waitFor(() => expect(screen.getByLabelText('First name')).toHaveValue('Smoke'));
    expect(screen.getByLabelText('Location')).toHaveValue('Eilat');
  });

  it('has labelled fields in order, then Save and Reset', async () => {
    await render();
    expect(screen.getByLabelText('First name')).toHaveValue('Dana');
    const names = [...document.querySelectorAll('input, button')].map(
      (el) =>
        (el as HTMLElement).closest('.field')?.querySelector('label')?.textContent ??
        el.textContent,
    );
    expect(names).toEqual(['First name', 'Last name', 'Username', 'Location', 'Save', 'Reset']);
  });

  it('saves blanks as null, confirms, and refreshes names everywhere', async () => {
    respond.mockResolvedValue({ ...SAVED, location: null });
    const { queryClient } = await render();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    type('Location', '   ');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(PROFILE_COPY.saved)).toBeInTheDocument();
    expect(patches()[0]![1]).toEqual({
      body: { username: null, firstName: 'Dana', lastName: null, location: null },
    });
    const keys = spy.mock.calls.map(([f]) => JSON.stringify(f?.queryKey));
    expect(keys).toEqual(expect.arrayContaining(['["me"]', '["items"]', '["item"]', '["decks"]']));
  });

  it('shows a limit message and does not send', async () => {
    await render();
    type('First name', 'x'.repeat(61));
    expect(screen.getByText(PROFILE_COPY.limit(60))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(patches()).toHaveLength(0);
  });

  it('keeps typed values and shows the server message when a save fails', async () => {
    respond.mockRejectedValue(
      new ApiError(422, {
        type: '/problems/validation',
        errors: [{ path: 'username', message: 'unavailable' }],
      }),
    );
    await render();
    type('Username', 'dana');
    type('First name', 'Danny');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText("That name isn't available")).toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toHaveValue('Danny');
    expect(screen.getByLabelText('Username')).toHaveValue('dana');
    expect(screen.queryByText(PROFILE_COPY.saved)).toBeNull();
  });

  it('shows one line for a failure without field messages', async () => {
    respond.mockRejectedValue(new Error('offline'));
    await render();
    type('Location', 'Tel Aviv');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(PROFILE_COPY.failed);
    expect(screen.getByLabelText('Location')).toHaveValue('Tel Aviv');
  });

  it('keeps edits as a draft, restores them after a remount, clears them on save', async () => {
    const first = await render();
    type('Location', 'Jerusalem');
    await waitFor(() => expect(kv.map.has(PROFILE_DRAFT_KEY)).toBe(true));
    first.unmount();

    respond.mockResolvedValue({ ...SAVED, location: 'Jerusalem' });
    await render();
    await waitFor(() => expect(screen.getByLabelText('Location')).toHaveValue('Jerusalem'));
    expect(screen.getByText(PROFILE_COPY.restored)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(PROFILE_COPY.saved);
    await waitFor(() => expect(kv.map.has(PROFILE_DRAFT_KEY)).toBe(false));
  });

  it('Reset returns to the saved values and drops the draft', async () => {
    await render();
    type('Location', 'Elsewhere');
    await waitFor(() => expect(kv.map.has(PROFILE_DRAFT_KEY)).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByLabelText('Location')).toHaveValue('Haifa');
    await waitFor(() => expect(kv.map.has(PROFILE_DRAFT_KEY)).toBe(false));
  });

  it('does not ask before leaving a clean form', async () => {
    const { navigate, location } = await render();
    act(() => navigate('/elsewhere'));
    await screen.findByText('Elsewhere');
    expect(location()).toBe('/elsewhere');
  });

  it('asks before leaving with unsaved edits; Discard leaves and drops the draft', async () => {
    const { navigate, location } = await render();
    type('Location', 'Other');
    act(() => navigate('/elsewhere'));
    const dialog = await screen.findByRole('dialog', { name: 'Discard changes?' });
    expect(dialog).toHaveTextContent('your profile');
    expect(location()).toBe('/here');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await screen.findByText('Elsewhere');
    expect(kv.map.has(PROFILE_DRAFT_KEY)).toBe(false);
  });

  it('checks the username while typing and offers a message, not who holds it', async () => {
    respond.mockResolvedValue({ available: false, reason: 'unavailable' });
    await render();
    type('Username', 'dana');
    expect(await screen.findByText("That name isn't available")).toBeInTheDocument();
    type('Username', 'ab');
    expect(screen.getByText('Use 3–30 letters, digits, ., _ or -')).toBeInTheDocument();
  });

  describe('photo', () => {
    afterEach(() => {
      mockConfig.cloudinaryCloudName = null;
    });

    it('restores a draft photo and saves it with the other fields', async () => {
      await kv.set(PROFILE_DRAFT_KEY, {
        v: 1,
        values: {
          username: '',
          firstName: 'Dana',
          lastName: '',
          location: 'Haifa',
          avatar: 'p/new',
        },
      });
      respond.mockResolvedValue({ ...SAVED, avatar: { publicId: 'p/new' } });
      await render();
      expect(await screen.findByText(PROFILE_COPY.restored)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await screen.findByText(PROFILE_COPY.saved);
      expect(patches()[0]![1]).toEqual({
        body: {
          username: null,
          firstName: 'Dana',
          lastName: null,
          location: 'Haifa',
          avatar: { publicId: 'p/new' },
        },
      });
    });

    it('removes the photo (avatar null), keeps it in the draft, and Reset restores it', async () => {
      mockConfig.cloudinaryCloudName = 'demo';
      await render({ ...SAVED, avatar: { publicId: 'p/old' } });
      fireEvent.click(await screen.findByRole('button', { name: 'Remove photo' }));
      await waitFor(() =>
        expect(
          (kv.map.get(PROFILE_DRAFT_KEY) as { values: { avatar: unknown } }).values.avatar,
        ).toBe(null),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
      expect(screen.getByRole('button', { name: 'Remove photo' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
      respond.mockResolvedValue({ ...SAVED, avatar: null });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await screen.findByText(PROFILE_COPY.saved);
      expect((patches()[0]![1] as { body: { avatar?: unknown } }).body.avatar).toBeNull();
    });
  });
});
