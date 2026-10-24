import type { ReactElement } from 'react';
import { adminErrorMessages } from './admin-errors';

/** The lines under a failed admin action; nothing while `error` is null. */
export function AdminError({ error }: { error: unknown }): ReactElement | null {
  if (!error) return null;
  return (
    <div className="form-error" role="alert">
      {adminErrorMessages(error).map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  );
}
