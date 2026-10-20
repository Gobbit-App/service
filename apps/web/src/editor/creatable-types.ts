/**
 * Item types the editor can create (`image` since 008). Its own module because the `/d/$slug/new`
 * route's `validateSearch` runs in the initial bundle, which must not pull in the draft model.
 */
export const CREATABLE_TYPES = ['text', 'link', 'image', 'table', 'calc'] as const;
export type CreatableType = (typeof CREATABLE_TYPES)[number];

export function isCreatableType(v: unknown): v is CreatableType {
  return typeof v === 'string' && (CREATABLE_TYPES as readonly string[]).includes(v);
}
