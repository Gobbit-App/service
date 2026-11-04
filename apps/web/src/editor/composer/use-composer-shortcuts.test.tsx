import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { composerKey, useComposerShortcuts } from './use-composer-shortcuts';

const key = (overrides: Partial<Parameters<typeof composerKey>[0]>) => ({
  key: 'a',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  isComposing: false,
  ...overrides,
});

describe('composerKey (D310)', () => {
  it('Ctrl+Enter and Cmd+Enter submit; plain Enter does not', () => {
    expect(composerKey(key({ key: 'Enter', ctrlKey: true }), false)).toBe('submit');
    expect(composerKey(key({ key: 'Enter', metaKey: true }), false)).toBe('submit');
    expect(composerKey(key({ key: 'Enter' }), false)).toBeNull();
  });

  it('plain Escape steps back; with modifiers it does not', () => {
    expect(composerKey(key({ key: 'Escape' }), false)).toBe('escape');
    expect(composerKey(key({ key: 'Escape', shiftKey: true }), false)).toBeNull();
  });

  it('ignores handled keys, IME composition and an open dialog', () => {
    expect(composerKey(key({ key: 'Escape', defaultPrevented: true }), false)).toBeNull();
    expect(composerKey(key({ key: 'Enter', ctrlKey: true, isComposing: true }), false)).toBeNull();
    expect(composerKey(key({ key: 'Escape' }), true)).toBeNull();
  });
});

function Harness({ onSubmit, onEscape }: { onSubmit: () => void; onEscape: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  useComposerShortcuts({ formRef, onEscape });
  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <input aria-label="Title" />
    </form>
  );
}

describe('useComposerShortcuts', () => {
  it('submits the form on Ctrl+Enter and calls onEscape on Escape', () => {
    const onSubmit = vi.fn();
    const onEscape = vi.fn();
    render(<Harness onSubmit={onSubmit} onEscape={onEscape} />);
    const title = screen.getByRole('textbox', { name: 'Title' });
    fireEvent.keyDown(title, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledOnce();
    fireEvent.keyDown(title, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it('leaves Escape to an open dialog', () => {
    const onEscape = vi.fn();
    render(<Harness onSubmit={vi.fn()} onEscape={onEscape} />);
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    dialog.remove();
    expect(onEscape).not.toHaveBeenCalled();
  });
});
