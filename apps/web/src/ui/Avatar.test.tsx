import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Avatar, avatarLabel } from './Avatar';

const cloud = vi.hoisted(() => ({ name: 'demo' as string | null }));
vi.mock('../cards/use-cloud-name', () => ({ useCloudName: () => cloud.name }));

beforeEach(() => {
  cloud.name = 'demo';
});

describe('avatarLabel (D422)', () => {
  it('prefers the username, then the name, then Member', () => {
    expect(avatarLabel({ username: 'dana', name: 'Dana Levi' })).toBe('dana');
    expect(avatarLabel({ username: null, name: 'Dana Levi' })).toBe('Dana Levi');
    expect(avatarLabel({})).toBe('Member');
  });
});

describe('Avatar (D428)', () => {
  it('shows initials on the palette colour, named "Added by <label>"', () => {
    render(<Avatar member={{ id: 'u1', initials: 'DL', username: 'dana' }} />);
    const el = screen.getByRole('img', { name: 'Added by dana' });
    expect(el).toHaveTextContent('DL');
    expect(el.tabIndex).toBe(0);
    expect(el).toHaveAttribute('data-tip', 'dana');
    expect(el.style.background).toMatch(/var\(--avatar-\d+-bg\)/);
    expect(el).toHaveClass('avatar--sm');
  });

  it('shows the photo through CloudImage with empty alt', () => {
    const { container } = render(
      <Avatar member={{ id: 'u1', initials: 'DL', photo: { publicId: 'p/1' } }} size="md" />,
    );
    expect(container.querySelector('.avatar--md .cloud-image__img')).toHaveAttribute('alt', '');
    expect(container).not.toHaveTextContent('DL');
  });

  it('falls back to initials when the photo fails', () => {
    const { container } = render(
      <Avatar member={{ id: 'u1', initials: 'DL', photo: { publicId: 'p/1' } }} />,
    );
    fireEvent.error(container.querySelector('.cloud-image__img')!);
    expect(container.querySelector('.cloud-image')).toBeNull();
    expect(container).toHaveTextContent('DL');
  });

  it('shows a person glyph with no initials and a neutral colour for a null id', () => {
    const { container } = render(<Avatar member={{ id: null, initials: '' }} />);
    expect(container.querySelector('svg.avatar__glyph')).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Added by Member' }).style.background).toBe('');
  });

  it('is neither a link nor a button and shows no @', () => {
    const { container } = render(
      <Avatar member={{ id: 'u1', initials: 'DL', name: 'Dana', username: 'dana' }} />,
    );
    expect(container.querySelector('a, button')).toBeNull();
    expect(container.innerHTML).not.toContain('@');
  });

  it('tells two members with the same initials apart by label', () => {
    render(
      <>
        <Avatar member={{ id: 'a', initials: 'DL', username: 'dana' }} />
        <Avatar member={{ id: 'b', initials: 'DL', username: 'dan' }} />
      </>,
    );
    expect(screen.getByRole('img', { name: 'Added by dana' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Added by dan' })).toBeInTheDocument();
  });

  it('takes an aria-label override and renders no title', () => {
    const { container } = render(
      <Avatar member={{ id: 'u1', initials: 'DL' }} ariaLabel="Your photo" />,
    );
    expect(screen.getByRole('img', { name: 'Your photo' })).toBeInTheDocument();
    expect(container.querySelector('[title]')).toBeNull();
  });
});
