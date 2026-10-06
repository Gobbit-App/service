import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TableCard } from './TableCard';
import type { TablePayload } from './payload-guards';

describe('TableCard', () => {
  it('renders region role with name Table and tabIndex 0', () => {
    const payload: TablePayload = {
      columns: ['Name', 'Age'],
      rows: [['Alice', '30']],
    };
    render(<TableCard payload={payload} />);
    const region = screen.getByRole('region', { name: 'Table' });
    expect(region).toHaveAttribute('tabIndex', '0');
  });

  it('renders column headers as columnheader role', () => {
    const payload: TablePayload = {
      columns: ['Name', 'Age'],
      rows: [['Alice', '30']],
    };
    render(<TableCard payload={payload} />);
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Age' })).toBeInTheDocument();
  });

  it('renders first cell of each row as rowheader', () => {
    const payload: TablePayload = {
      columns: ['Name', 'Age'],
      rows: [
        ['Alice', '30'],
        ['Bob', '25'],
      ],
    };
    render(<TableCard payload={payload} />);
    expect(screen.getByRole('rowheader', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Bob' })).toBeInTheDocument();
  });

  it('renders other cells as cell role', () => {
    const payload: TablePayload = {
      columns: ['Name', 'Age'],
      rows: [['Alice', '30']],
    };
    render(<TableCard payload={payload} />);
    expect(screen.getByRole('cell', { name: '30' })).toBeInTheDocument();
  });

  it('renders header and shows No rows message when zero rows', () => {
    const payload: TablePayload = {
      columns: ['Name', 'Age'],
      rows: [],
    };
    render(<TableCard payload={payload} />);
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByText('No rows')).toBeInTheDocument();
  });

  it('Hebrew text cells have dir auto', () => {
    const payload: TablePayload = {
      columns: ['שם', 'גיל'],
      rows: [['אליס', '30']],
    };
    render(<TableCard payload={payload} />);
    const hebrewHeader = screen.getByRole('columnheader', {
      name: 'שם',
    });
    expect(hebrewHeader).toHaveAttribute('dir', 'auto');
    const hebrewRowHeader = screen.getByRole('rowheader', {
      name: 'אליס',
    });
    expect(hebrewRowHeader).toHaveAttribute('dir', 'auto');
  });
});
