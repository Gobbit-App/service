import type { ReactElement } from 'react';
import type { PublishRequest } from '@gobbit/shared';
import { Button } from '../ui/buttons/Button';
import type { ReviewMode } from './review-mode';

/**
 * D106: the publish decision for one proposal — Publish for a new card, else Apply update with
 * Publish as new beside it. `extra` carries the shared choices (e.g. `createCategory`).
 */
export function PublishButtons({
  mode,
  busy,
  extra = {},
  onPublish,
}: {
  mode: ReviewMode;
  busy: boolean;
  extra?: Partial<PublishRequest>;
  onPublish: (request: Partial<PublishRequest>) => void;
}): ReactElement {
  if (mode.kind === 'new') {
    return (
      <Button
        icon="check"
        label="Publish"
        disabled={busy}
        onClick={() => onPublish({ mode: 'new', ...extra })}
      />
    );
  }
  return (
    <>
      <Button
        icon="check"
        label="Apply update"
        disabled={busy}
        onClick={() => onPublish({ mode: 'update', ...extra })}
      />
      <Button
        icon="plus"
        label="Publish as new"
        variant="ghost"
        disabled={busy}
        onClick={() => onPublish({ mode: 'new', ...extra })}
      />
    </>
  );
}

/** D106: "Create category …" for a proposal whose job suggested a new category. */
export function CreateCategoryToggle({
  name,
  checked,
  onChange,
}: {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): ReactElement {
  return (
    <label className="review-card__new-category">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      Create category “{name}”
    </label>
  );
}
