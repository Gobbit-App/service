import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NavigateContext } from './NavLink';
import { MoreMenu, type MenuAction } from './MoreMenu';

function setup(extra: Partial<MenuAction> = {}) {
  const archive = vi.fn();
  const remove = vi.fn();
  const navigate = vi.fn();
  const actions: MenuAction[] = [
    { key: 'history', label: 'History', icon: 'history', href: '/d/x/log?item=1' },
    { key: 'archive', label: 'Archive', icon: 'archive', onSelect: archive, ...extra },
    { key: 'delete', label: 'Delete', icon: 'trash', onSelect: remove, tone: 'danger' },
  ];
  render(
    <NavigateContext.Provider value={navigate}>
      <button type="button">outside</button>
      <MoreMenu actions={actions} />
    </NavigateContext.Provider>,
  );
  return { archive, remove, navigate };
}

describe('MoreMenu (D213)', () => {
  it('opens a menu and focuses the first item', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'More actions' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'History' })).toHaveFocus();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveClass('menu__item--danger');
  });

  it('moves with arrows, Home and End, and closes with Escape', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'More actions' });
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'History' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('runs an action or navigates, then closes', async () => {
    const { archive, navigate } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(archive).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'History' }));
    expect(navigate).toHaveBeenCalledWith('/d/x/log?item=1');
  });

  it('ignores an item with a disabled reason', async () => {
    const { archive } = setup({ disabledReason: 'needs a connection' });
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const item = screen.getByRole('menuitem', { name: 'Archive' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(item);
    expect(archive).not.toHaveBeenCalled();
  });

  it('closes on a pointer outside', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
