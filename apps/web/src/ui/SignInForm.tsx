import { useState, type ReactElement } from 'react';
import { isApiError } from '../api/api-error';

type State =
  | { step: 'idle' }
  | { step: 'sending' }
  | { step: 'sent'; email: string }
  | { step: 'error'; message: string };

/** Sign-in form for email authentication. */
export function SignInForm({
  onSubmit,
}: {
  onSubmit: (email: string) => Promise<void>;
}): ReactElement {
  const [state, setState] = useState<State>({ step: 'idle' });
  const [emailInput, setEmailInput] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedEmail = emailInput.trim();

    setState({ step: 'sending' });
    try {
      await onSubmit(trimmedEmail);
      setState({ step: 'sent', email: trimmedEmail });
    } catch (error) {
      let message = "Couldn't send the link. Check your connection and try again.";
      if (isApiError(error) && error.status === 429) {
        message = 'Too many requests. Try again in a few minutes.';
      }
      setState({ step: 'error', message });
    }
  };

  const handleReset = () => {
    setState({ step: 'idle' });
    setEmailInput('');
  };

  if (state.step === 'sent') {
    return (
      <div className="sign-in-sent" role="status">
        <h2>Check your inbox</h2>
        <p>
          We sent a sign-in link to <strong>{state.email}</strong>. It works once and expires soon.
        </p>
        <button type="button" className="button button--ghost" onClick={handleReset}>
          Use a different email
        </button>
      </div>
    );
  }

  const isSending = state.step === 'sending';
  const errorMessage = state.step === 'error' ? state.message : null;

  return (
    <>
      <form className="sign-in-form" onSubmit={handleSubmit}>
        <label htmlFor="email-input">Email</label>
        <input
          id="email-input"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={emailInput}
          onChange={(e) => setEmailInput(e.currentTarget.value)}
        />
        <button type="submit" className="button" disabled={isSending}>
          {isSending ? 'Sending…' : 'Send sign-in link'}
        </button>
      </form>
      {errorMessage && (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      )}
    </>
  );
}
