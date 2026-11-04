import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NavigateContext } from '../../ui/NavLink';
import { ComposerTopBar, type ComposerTopBarProps } from './ComposerTopBar';

function renderBar(overrides: Partial<ComposerTopBarProps> = {}) {
  const navigate = vi.fn();
  const onBlockedSave = vi.fn();
  render(
    <NavigateContext.Provider value={navigate}>
      <form onSubmit={(event) => event.preventDefault()}>
        <ComposerTopBar
          heading="New card"
          deckName="Family"
          closeHref="/d/family"
          saving={false}
          blockedReason={null}
          showReason={false}
          onBlockedSave={onBlockedSave}
          {...overrides}
        />
      </form>
    </NavigateContext.Provider>,
  );
  return { navigate, onBlockedSave };
}

describe('ComposerTopBar (D300, D308)', () => {
  it('names Close, the heading with its deck and Save per the contract', async () => {
    const { navigate } = renderBar();
    expect(screen.getByRole('heading', { level: 1, name: 'New card' })).toBeInTheDocument();
    expect(screen.getByText('Family')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('type', 'submit');
    expect(save).not.toHaveAttribute('aria-disabled');
    await userEvent.click(screen.getByRole('link', { name: 'Close' }));
    expect(navigate).toHaveBeenCalledWith('/d/family');
  });

  it('a blocked Save is focusable, described by its reason and reports the attempt', async () => {
    const { onBlockedSave } = renderBar({ blockedReason: 'Fix 1 field' });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).toHaveAccessibleDescription('Fix 1 field');
    // Not shown yet (untouched card): only there for assistive tech.
    expect(screen.getByText('Fix 1 field')).toHaveClass('visually-hidden');
    await userEvent.click(save);
    expect(onBlockedSave).toHaveBeenCalledOnce();
  });

  it('shows the reason once asked to', () => {
    renderBar({ blockedReason: 'Fix 2 fields', showReason: true });
    expect(screen.getByText('Fix 2 fields')).not.toHaveClass('visually-hidden');
  });

  it('keeps the name "Save" while busy and draws a progress line', () => {
    renderBar({ saving: true, blockedReason: 'Fix 1 field' });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('aria-busy', 'true');
    expect(save).not.toHaveAttribute('aria-disabled');
    expect(document.querySelector('.composer-bar__progress')).not.toBeNull();
  });
});
