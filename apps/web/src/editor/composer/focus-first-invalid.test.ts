import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusFirstInvalid } from './focus-first-invalid';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('focusFirstInvalid (D308)', () => {
  it('focuses the first invalid field and scrolls it to the centre', () => {
    document.body.innerHTML = `
      <form>
        <input id="ok" />
        <input id="first" aria-invalid="true" />
        <div id="second" contenteditable="true" tabindex="0" aria-invalid="true"></div>
      </form>`;
    const first = document.getElementById('first') as HTMLInputElement;
    const scroll = vi.fn();
    first.scrollIntoView = scroll;
    expect(focusFirstInvalid(document.querySelector('form'))).toBe(true);
    expect(first).toHaveFocus();
    expect(scroll).toHaveBeenCalledWith({ block: 'center' });
  });

  it('ignores fields marked valid and reports when nothing is invalid', () => {
    document.body.innerHTML = '<form><input aria-invalid="false" /></form>';
    expect(focusFirstInvalid(document.querySelector('form'))).toBe(false);
    expect(document.body).toHaveFocus();
  });

  it('copes with no root', () => {
    expect(focusFirstInvalid(null)).toBe(false);
  });
});
