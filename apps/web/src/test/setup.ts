import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { installResizeObserver } from './resize-observer';

// jsdom has no ResizeObserver; `useElementWidth` keeps one shared instance for the whole run.
installResizeObserver();

afterEach(() => {
  cleanup();
});
