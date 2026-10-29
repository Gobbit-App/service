import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SEARCH_DEBOUNCE_MS } from '@gobbit/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchBox } from './SearchBox';

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('SearchBox', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('emits the trimmed value once after the debounce delay', () => {
    const onSearch = vi.fn();
    render(<SearchBox onSearch={onSearch} />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '  cats  ' } });
    expect(onSearch).not.toHaveBeenCalled();

    advance(SEARCH_DEBOUNCE_MS);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('cats');
  });

  it('emits only the final value while typing rapidly', () => {
    const onSearch = vi.fn();
    render(<SearchBox onSearch={onSearch} />);
    const input = screen.getByRole('searchbox');

    fireEvent.change(input, { target: { value: 'a' } });
    advance(SEARCH_DEBOUNCE_MS / 2);
    fireEvent.change(input, { target: { value: 'ab' } });
    advance(SEARCH_DEBOUNCE_MS / 2);
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(onSearch).not.toHaveBeenCalled();

    advance(SEARCH_DEBOUNCE_MS);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('abc');
  });

  it('does not emit for a whitespace-only change from an empty initial query', () => {
    const onSearch = vi.fn();
    render(<SearchBox onSearch={onSearch} />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '   ' } });
    advance(SEARCH_DEBOUNCE_MS * 2);

    expect(onSearch).not.toHaveBeenCalled();
  });

  it('emits immediately on submit and does not re-emit the same value via debounce', () => {
    const onSearch = vi.fn();
    render(<SearchBox onSearch={onSearch} />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: ' cats ' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('cats');

    advance(SEARCH_DEBOUNCE_MS * 2);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('prefills from initialQuery without re-emitting it', () => {
    const onSearch = vi.fn();
    render(<SearchBox initialQuery="  hello " onSearch={onSearch} />);

    expect(screen.getByRole('searchbox')).toHaveValue('  hello ');

    advance(SEARCH_DEBOUNCE_MS * 2);
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('exposes a search landmark and a labelled input', () => {
    render(<SearchBox onSearch={vi.fn()} />);

    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search this pocketbook' })).toBeInTheDocument();
  });

  it('follows a new initialQuery without emitting it', () => {
    const onSearch = vi.fn();
    const { rerender } = render(<SearchBox initialQuery="cats" onSearch={onSearch} />);
    rerender(<SearchBox initialQuery="dogs" onSearch={onSearch} />);
    expect(screen.getByRole('searchbox')).toHaveValue('dogs');
    advance(SEARCH_DEBOUNCE_MS);
    expect(onSearch).not.toHaveBeenCalled();
  });
});
