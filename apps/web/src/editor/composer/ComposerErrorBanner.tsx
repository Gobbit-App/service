import type { ReactElement } from 'react';

/**
 * D308 (039): a save the server refused (or a calculator check that failed to load) is announced
 * at the top of the writing area, where the eye is after pressing Save in the top bar.
 */
export function ComposerErrorBanner({ message }: { message: string | null }): ReactElement | null {
  if (!message) return null;
  return (
    <p className="composer-error form-error" role="alert">
      {message}
    </p>
  );
}
