/** Every permission a route or service can check (§ 4 of the Phase 2 plan). */
export const permissions = [
  'deck.read',
  'deck.update',
  'deck.delete',
  'category.read',
  'category.read_private',
  'category.create',
  'category.update',
  'item.read',
  'item.create',
  'item.update',
  'item.archive',
  'item.delete',
  'item.publish',
  'item.favorite',
  'member.list',
  'member.invite',
  'member.remove',
] as const;

export type Permission = (typeof permissions)[number];
