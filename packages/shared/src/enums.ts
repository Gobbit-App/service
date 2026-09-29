export const deckKinds = ['personal', 'shared', 'communal'] as const;
export type DeckKind = (typeof deckKinds)[number];

export const categoryVisibilities = ['private', 'shared', 'public'] as const;
export type CategoryVisibility = (typeof categoryVisibilities)[number];

export const itemTypes = ['text', 'link', 'image', 'table', 'calc'] as const;
export type ItemType = (typeof itemTypes)[number];

export const itemStatuses = ['proposed', 'published', 'archived'] as const;
export type ItemStatus = (typeof itemStatuses)[number];

export const sourceKinds = ['manual', 'link', 'share', 'email', 'telegram', 'import'] as const;
export type SourceKind = (typeof sourceKinds)[number];

export const memberRoles = ['owner', 'maintainer', 'editor', 'reader'] as const;
export type MemberRole = (typeof memberRoles)[number];

export const magicLinkPurposes = ['sign_in', 'invite'] as const;
export type MagicLinkPurpose = (typeof magicLinkPurposes)[number];

export const sessionKinds = ['cookie', 'bearer'] as const;
export type SessionKind = (typeof sessionKinds)[number];
