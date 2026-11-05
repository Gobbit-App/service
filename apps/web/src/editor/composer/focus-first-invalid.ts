/** Fields marked invalid by `TextInput`, the rich body and the payload editors. */
const INVALID = '[aria-invalid="true"]';

/**
 * D308 (039): move focus to the first invalid field inside `root` and scroll it to the centre,
 * so a refused Save lands where the fix is. Returns whether a field was found.
 */
export function focusFirstInvalid(root: ParentNode | null): boolean {
  const field = root?.querySelector<HTMLElement>(INVALID);
  if (!field) return false;
  field.focus({ preventScroll: true });
  field.scrollIntoView?.({ block: 'center' });
  return true;
}
