import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalcCard } from './CalcCard';
import type { CalcPayload } from './payload-guards';

describe('CalcCard', () => {
  it('shows initial calculation result', () => {
    const payload: CalcPayload = {
      fields: [
        { key: 'a', label: 'Width', default: 2 },
        { key: 'b', label: 'Height', default: 3 },
      ],
      expression: 'a * b',
      resultLabel: 'Area',
    };

    render(<CalcCard payload={payload} />);

    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('updates result when field value changes', async () => {
    const user = userEvent.setup();
    const payload: CalcPayload = {
      fields: [
        { key: 'a', label: 'Width', default: 2 },
        { key: 'b', label: 'Height', default: 3 },
      ],
      expression: 'a * b',
      resultLabel: 'Area',
    };

    render(<CalcCard payload={payload} />);

    const widthInput = screen.getByLabelText('Width');
    await user.clear(widthInput);
    await user.type(widthInput, '4');

    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('shows — when field is cleared', async () => {
    const user = userEvent.setup();
    const payload: CalcPayload = {
      fields: [
        { key: 'a', label: 'Width', default: 2 },
        { key: 'b', label: 'Height', default: 3 },
      ],
      expression: 'a * b',
      resultLabel: 'Area',
    };

    render(<CalcCard payload={payload} />);

    const widthInput = screen.getByLabelText('Width');
    await user.clear(widthInput);

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows — for invalid calculation', () => {
    const payload: CalcPayload = {
      fields: [
        { key: 'a', label: 'Numerator', default: 1 },
        { key: 'b', label: 'Denominator', default: 0 },
      ],
      expression: 'a / b',
      resultLabel: 'Result',
    };

    render(<CalcCard payload={payload} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders unit text', () => {
    const payload: CalcPayload = {
      fields: [{ key: 'a', label: 'Length', unit: 'cm', default: 5 }],
      expression: 'a',
      resultLabel: 'Value',
    };

    render(<CalcCard payload={payload} />);

    expect(screen.getByText('cm')).toBeInTheDocument();
  });
});
