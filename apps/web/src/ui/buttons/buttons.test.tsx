import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NavigateContext } from '../NavLink';
import { Button } from './Button';
import { ButtonLink } from './ButtonLink';
import { IconButton } from './IconButton';
import { IconLink } from './IconLink';

describe('IconButton (D211)', () => {
  it('is named by its label, shows a tooltip and an icon', () => {
    render(<IconButton icon="edit" label="Edit" />);
    const button = screen.getByRole('button', { name: 'Edit' });
    expect(button).toHaveAttribute('data-tip', 'Edit');
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button).not.toHaveAttribute('aria-pressed');
  });

  it('exposes the pressed state of a toggle', () => {
    render(<IconButton icon="star" label="Remove from favorites" pressed />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('stays focusable but ignores clicks while it has a disabled reason', async () => {
    const onClick = vi.fn();
    render(
      <IconButton
        icon="archive"
        label="Archive"
        disabledReason="needs a connection"
        onClick={onClick}
      />,
    );
    const button = screen.getByRole('button', { name: 'Archive' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('data-tip', 'Archive — needs a connection');
    expect(button).not.toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('marks the danger tone', () => {
    render(<IconButton icon="trash" label="Delete" tone="danger" />);
    expect(screen.getByRole('button')).toHaveClass('icon-button--danger');
  });
});

describe('Button (D211)', () => {
  it('renders an icon and a label that names it', async () => {
    const onClick = vi.fn();
    render(<Button icon="check" label="Save card" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Save card' });
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button.querySelector('.button__label')).toHaveTextContent('Save card');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('uses the danger style', () => {
    render(<Button icon="trash" label="Revoke" variant="danger" />);
    expect(screen.getByRole('button')).toHaveClass('button--danger');
  });
});

describe('IconLink and ButtonLink', () => {
  it('navigate in-app on a plain click', async () => {
    const navigate = vi.fn();
    render(
      <NavigateContext.Provider value={navigate}>
        <IconLink href="/settings" icon="settings" label="Settings" />
        <ButtonLink href="/d/x/new" icon="plus" label="Add card" />
      </NavigateContext.Provider>,
    );
    const settings = screen.getByRole('link', { name: 'Settings' });
    expect(settings).toHaveAttribute('data-tip', 'Settings');
    await userEvent.click(settings);
    await userEvent.click(screen.getByRole('link', { name: 'Add card' }));
    expect(navigate.mock.calls.map(([href]) => href)).toEqual(['/settings', '/d/x/new']);
  });
});
