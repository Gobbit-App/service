export const deckKinds = ['personal', 'shared', 'communal'] as const;
export type DeckKind = (typeof deckKinds)[number];

export const categoryVisibilities = ['private', 'shared', 'public'] as const;
export type CategoryVisibility = (typeof categoryVisibilities)[number];

/** D386: `media` was `image` before 045; `image` is still accepted as an input alias (D387). */
export const itemTypes = ['text', 'link', 'media', 'table', 'calc', 'reminder', 'event'] as const;
export type ItemType = (typeof itemTypes)[number];
/** D387: the pre-045 name of `media`, accepted on input for one release. */
export const LEGACY_IMAGE_TYPE = 'image' as const;
/** Item type values accepted on input: every type plus the D387 alias. */
export const itemTypeInputs = [...itemTypes, LEGACY_IMAGE_TYPE] as const;
export type ItemTypeInput = (typeof itemTypeInputs)[number];

/** D386: the file a media card holds. */
export const mediaKinds = ['image', 'pdf', 'audio', 'video'] as const;
export type MediaKind = (typeof mediaKinds)[number];

/** D388: the provider resource a file is stored as (PDFs are images, audio is video). */
export const assetResourceTypes = ['image', 'video'] as const;
export type AssetResourceType = (typeof assetResourceTypes)[number];

export const itemStatuses = ['proposed', 'published', 'archived'] as const;
export type ItemStatus = (typeof itemStatuses)[number];

/**
 * D132: `status` values the item list accepts; `deleted` is list-only, not a DB status.
 * D292: `upcoming` lists reminders that haven't reached their reveal time.
 */
export const itemListStatuses = [...itemStatuses, 'deleted', 'upcoming'] as const;
export type ItemListStatus = (typeof itemListStatuses)[number];

export const sourceKinds = [
  'manual',
  'link',
  'share',
  'email',
  'telegram',
  'import',
  'mcp',
] as const;
export type SourceKind = (typeof sourceKinds)[number];

export const memberRoles = ['owner', 'maintainer', 'editor', 'reader'] as const;
export type MemberRole = (typeof memberRoles)[number];

export const magicLinkPurposes = ['sign_in', 'invite'] as const;
export type MagicLinkPurpose = (typeof magicLinkPurposes)[number];

export const sessionKinds = ['cookie', 'bearer'] as const;
export type SessionKind = (typeof sessionKinds)[number];

/** D156: where a recorded image came from. */
export const assetSources = ['editor', 'ingest', 'link_snapshot', 'remote'] as const;
export type AssetSource = (typeof assetSources)[number];

/** D164: latest classified state of a link card (`unchecked`: a host the check never probes, 015). */
export const linkCheckStatuses = ['ok', 'dead', 'changed', 'unchecked'] as const;
export type LinkCheckStatus = (typeof linkCheckStatuses)[number];
/** D165: the statuses a member sees as a flag. */
export const linkFlagStatuses = ['dead', 'changed'] as const;
export type LinkFlagStatus = (typeof linkFlagStatuses)[number];

/** D217: who a waitlist entry is for, where it came from, and where it stands. */
export const waitlistKinds = ['family', 'community', 'personal', 'other'] as const;
export type WaitlistKind = (typeof waitlistKinds)[number];

export const waitlistSources = ['landing', 'sign_in'] as const;
export type WaitlistSource = (typeof waitlistSources)[number];

export const waitlistStatuses = ['pending', 'confirmed', 'invited', 'removed'] as const;
export type WaitlistStatus = (typeof waitlistStatuses)[number];

/** D240: one audit row per change to a waitlist entry. */
export const waitlistEventActions = [
  'created',
  'resent',
  'confirmed',
  'invited',
  'invite_resent',
  'removed',
] as const;
export type WaitlistEventAction = (typeof waitlistEventActions)[number];
