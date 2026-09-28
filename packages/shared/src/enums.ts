export const pocketbookKinds = ['personal', 'shared', 'communal'] as const;
export type PocketbookKind = (typeof pocketbookKinds)[number];

export const categoryVisibilities = ['private', 'shared', 'public'] as const;
export type CategoryVisibility = (typeof categoryVisibilities)[number];

export const itemTypes = ['text', 'link', 'image', 'table', 'calc'] as const;
export type ItemType = (typeof itemTypes)[number];

export const itemStatuses = ['proposed', 'published', 'archived'] as const;
export type ItemStatus = (typeof itemStatuses)[number];

export const sourceKinds = ['manual', 'link', 'share', 'email', 'telegram', 'import'] as const;
export type SourceKind = (typeof sourceKinds)[number];
