import type { AppConfig } from '@gobbit/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../api/query-keys';
import { renderWithClient, testQueryClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond } = await import('../test/api-mock');
const { AboutSheet } = await import('./AboutSheet');

const SHA = '4553f42aa1b2c3d4e5f60718293a4b5c6d7e8f90';
const BUILD = { commit: SHA, builtAt: '2026-11-06T09:30:00.000Z' };

const CONFIG: AppConfig = {
  cloudinaryCloudName: 'demo',
  commit: SHA,
  search: { semantic: true, ask: true },
  ingest: { enabled: true, emailDomain: null, shortcutUrl: null },
  analytics: null,
  push: null,
};

function setup({ config = CONFIG as AppConfig | null, build = BUILD } = {}) {
  const queryClient = testQueryClient();
  if (config) queryClient.setQueryData(queryKeys.config, config);
  const onClose = vi.fn();
  renderWithClient(<AboutSheet onClose={onClose} build={build} />, { queryClient });
  return { onClose, dialog: screen.getByRole('dialog', { name: 'Gobbit' }) };
}

const fact = (dialog: HTMLElement, term: string) =>
  within(dialog).getByText(term, { selector: 'dt' }).nextElementSibling;

beforeEach(() => {
  respond.mockReset();
  respond.mockRejectedValue(new Error('offline'));
});

describe('AboutSheet (D354)', () => {
  it('shows the logo, version linked to its commit and the release date', () => {
    const { dialog } = setup();
    expect(dialog.querySelector('img.about__logo')).toHaveAttribute('src', '/favicon.svg');
    expect(within(dialog).getByText("Your family's deck of useful cards")).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '4553f42' })).toHaveAttribute(
      'href',
      `https://github.com/Gobbit-App/service/commit/${SHA}`,
    );
    expect(fact(dialog, 'Released')?.querySelector('time')).toHaveAttribute(
      'dateTime',
      BUILD.builtAt,
    );
    expect(within(dialog).getByText('© 2026 The Gobbit authors')).toBeInTheDocument();
  });

  it('hides the server row while the server runs the same commit', () => {
    const { dialog } = setup();
    expect(within(dialog).queryByText('Server', { selector: 'dt' })).toBeNull();
  });

  it('shows the server commit when it differs from the app', () => {
    const { dialog } = setup({ config: { ...CONFIG, commit: 'abcdef1234567' } });
    expect(fact(dialog, 'Server')).toHaveTextContent('abcdef1');
  });

  it('credits only the services this server uses', () => {
    const { dialog } = setup();
    const credits = within(dialog).getByRole('region', { name: 'Services we use' });
    expect(within(credits).getByRole('link', { name: 'Cloudinary' })).toHaveAttribute(
      'href',
      'https://cloudinary.com',
    );
    expect(credits).toHaveTextContent('AI language models');
    expect(credits).toHaveTextContent('YouTube, TikTok and Vimeo');
    expect(credits).not.toHaveTextContent('Umami');
  });

  it('links the license, source, notices, issues and security policy in new tabs', () => {
    const { dialog } = setup();
    const source = within(dialog).getByRole('region', { name: 'Open source' });
    const hrefs = Object.fromEntries(
      within(source)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    );
    expect(hrefs).toEqual({
      'Mozilla Public License 2.0': 'https://github.com/Gobbit-App/service/blob/main/LICENSE',
      'Source code': 'https://github.com/Gobbit-App/service',
      'Open-source notices': '/licenses.txt',
      'Report a problem': 'https://github.com/Gobbit-App/service/issues',
      'Security policy': 'https://github.com/Gobbit-App/service/security/policy',
    });
    for (const link of within(source).getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
  });

  it('still shows the build facts without a config (offline, never fetched)', () => {
    const { dialog } = setup({ config: null, build: { commit: 'dev', builtAt: 'nope' } });
    expect(fact(dialog, 'Version')).toHaveTextContent('Development build');
    expect(within(dialog).queryByText('Released', { selector: 'dt' })).toBeNull();
    expect(within(dialog).queryByRole('region', { name: 'Services we use' })).toBeNull();
    expect(within(dialog).getByText('© The Gobbit authors')).toBeInTheDocument();
  });

  it('focuses Close on open and closes from it', async () => {
    const { dialog, onClose } = setup();
    const close = within(dialog).getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();
    await userEvent.click(close);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
