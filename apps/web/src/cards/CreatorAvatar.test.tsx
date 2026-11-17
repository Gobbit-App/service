import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreatorAvatar } from './CreatorAvatar';

vi.mock('./use-cloud-name', () => ({ useCloudName: () => 'demo' }));

const base = { name: null, username: null, photo: null, initials: 'D' };

describe('CreatorAvatar (D421)', () => {
  it('shows the member', () => {
    render(
      <CreatorAvatar
        creator={{ ...base, id: '00000000-0000-4000-8000-0000000000a1', username: 'dana' }}
      />,
    );
    expect(screen.getByRole('img', { name: 'Added by dana' })).toHaveTextContent('D');
  });

  it('shows a placeholder glyph for an unknown creator', () => {
    render(<CreatorAvatar creator={{ ...base, id: null, initials: '' }} />);
    expect(screen.getByRole('img', { name: /^Added by/ })).not.toHaveTextContent(/\w/);
  });

  it('renders nothing for a personal deck', () => {
    const { container } = render(<CreatorAvatar creator={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('never shows an email-derived name (D422)', () => {
    const { container } = render(
      <CreatorAvatar creator={{ ...base, id: '00000000-0000-4000-8000-0000000000a2' }} />,
    );
    const el = screen.getByRole('img', { name: 'Added by Member' });
    expect(el).toHaveAttribute('data-tip', 'Member');
    const attrs = [...container.querySelectorAll('*')].flatMap((n) =>
      [...n.attributes].map((a) => a.value),
    );
    expect(attrs.some((v) => v.includes('@'))).toBe(false);
  });

  it('labels with the username (D422)', () => {
    render(
      <CreatorAvatar
        creator={{ ...base, id: '00000000-0000-4000-8000-0000000000a3', username: 'dana' }}
      />,
    );
    expect(screen.getByRole('img', { name: 'Added by dana' })).toHaveAttribute('data-tip', 'dana');
  });
});
