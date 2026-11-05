import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ItemType } from '@gobbit/shared';
import { TypeControl, TypeLabel } from './TypeControl';

function renderControl({
  value = 'link',
  hasContent = false,
  disabled = false,
}: { value?: ItemType; hasContent?: boolean; disabled?: boolean } = {}) {
  const onChange = vi.fn();
  render(
    <TypeControl
      value={value}
      hasContent={hasContent}
      imagesOff={false}
      disabled={disabled}
      onChange={onChange}
    />,
  );
  return {
    onChange,
    control: screen.getByRole('button', {
      name: `Card type: ${value === 'link' ? 'Link' : 'Text'}`,
    }),
  };
}

describe('TypeControl (D303)', () => {
  it('opens the tiles in a sheet with the current type checked', async () => {
    const { control } = renderControl();
    expect(control).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(control);
    expect(screen.getByRole('dialog', { name: 'Choose a card type' })).toBeInTheDocument();
    const link = screen.getByRole('radio', { name: 'Link' });
    expect(link).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(link).toHaveFocus());
  });

  it('switches freely when the card holds nothing the new type would lose', () => {
    const { control, onChange } = renderControl();
    fireEvent.click(control);
    fireEvent.click(screen.getByRole('radio', { name: 'Table' }));
    expect(onChange).toHaveBeenCalledWith('table');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('picking the current type just closes', () => {
    const { control, onChange } = renderControl();
    fireEvent.click(control);
    fireEvent.click(screen.getByRole('radio', { name: 'Link' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks first when content would be removed; Keep cancels', () => {
    const { control, onChange } = renderControl({ hasContent: true });
    fireEvent.click(control);
    fireEvent.click(screen.getByRole('radio', { name: 'Table' }));
    const confirm = screen.getByRole('dialog', { name: 'Switch to Table?' });
    expect(confirm).toHaveTextContent('Your link content will be removed.');
    expect(screen.getByRole('button', { name: 'Keep Link' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Keep Link' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('switches after confirming', () => {
    const { control, onChange } = renderControl({ hasContent: true });
    fireEvent.click(control);
    fireEvent.click(screen.getByRole('radio', { name: 'Calc' }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
    expect(onChange).toHaveBeenCalledWith('calc');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not open while disabled (saving)', () => {
    const { control } = renderControl({ disabled: true });
    expect(control).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(control);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('TypeLabel (D303)', () => {
  it('shows an existing card type as text, not a control', () => {
    render(<TypeLabel type="table" />);
    expect(screen.getByText('Table card')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
