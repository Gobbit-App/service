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
});
