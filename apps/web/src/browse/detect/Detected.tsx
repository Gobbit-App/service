import type { ReactElement, ReactNode } from 'react';
import { showToast } from '../../ui/toast-store';
import type { DetectKind } from './segment';

/** How long "Copied" stays (contracts/browse-ui.md §3). */
export const COPY_TOAST_MS = 2000;

const HREF: Record<Exclude<DetectKind, 'number'>, (value: string) => string> = {
  email: (value) => `mailto:${value}`,
  phone: (value) => `tel:${value}`,
  url: (value) => value,
};

const VERB: Record<DetectKind, string> = {
  email: 'Email',
  phone: 'Call',
  url: 'Open',
  number: 'Copy',
};

export function isDetectKind(kind: unknown): kind is DetectKind {
  return typeof kind === 'string' && kind in VERB;
}

/** Copies `value`, then says whether it worked; a refusal is shown, never swallowed. */
export async function copyNumber(value: string): Promise<void> {
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(value);
    showToast({ message: 'Copied', timeoutMs: COPY_TOAST_MS });
  } catch {
    showToast({ message: "Couldn't copy that number", timeoutMs: COPY_TOAST_MS });
  }
}

/**
 * D340: one recognised piece of card text as a control: a link that emails, calls or opens it,
 * or (numbers) an inline button that copies it. The text reads as written; the label names the
 * action. `data-detect` keeps the Browse page's tap and long-press handlers off it.
 */
export function Detected({
  kind,
  value,
  children,
}: {
  kind: DetectKind;
  value: string;
  children: ReactNode;
}): ReactElement {
  const text = typeof children === 'string' ? children : value;
  const label = `${VERB[kind]} ${text}`;
  if (kind === 'number') {
    return (
      <button
        type="button"
        className="detected detected--number"
        data-detect={kind}
        aria-label={label}
        onClick={() => void copyNumber(value)}
      >
        {children}
      </button>
    );
  }
  const external = kind === 'url' ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
    <a
      className={`detected detected--${kind}`}
      data-detect={kind}
      href={HREF[kind](value)}
      aria-label={label}
      {...external}
    >
      {children}
    </a>
  );
}
