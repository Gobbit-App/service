import { pgEnum, timestamp } from 'drizzle-orm/pg-core';
import {
  categoryVisibilities,
  itemStatuses,
  itemTypes,
  deckKinds,
  sourceKinds,
  memberRoles,
  magicLinkPurposes,
  sessionKinds,
  waitlistKinds,
  waitlistSources,
  waitlistStatuses,
  waitlistEventActions,
  registrationReasons,
} from '@pb/shared';

export const tstz = () => timestamp({ withTimezone: true, precision: 3, mode: 'date' });

export const timestamps = {
  createdAt: tstz().notNull().defaultNow(),
  updatedAt: tstz().notNull().defaultNow(),
  deletedAt: tstz(),
};

export const deckKindEnum = pgEnum('deck_kind', deckKinds);
export const categoryVisibilityEnum = pgEnum('category_visibility', categoryVisibilities);
export const itemTypeEnum = pgEnum('item_type', itemTypes);
export const itemStatusEnum = pgEnum('item_status', itemStatuses);
export const sourceKindEnum = pgEnum('source_kind', sourceKinds);
export const memberRoleEnum = pgEnum('member_role', memberRoles);
export const magicLinkPurposeEnum = pgEnum('magic_link_purpose', magicLinkPurposes);
export const sessionKindEnum = pgEnum('session_kind', sessionKinds);
export const waitlistKindEnum = pgEnum('waitlist_kind', waitlistKinds);
export const waitlistSourceEnum = pgEnum('waitlist_source', waitlistSources);
export const waitlistStatusEnum = pgEnum('waitlist_status', waitlistStatuses);
export const waitlistEventActionEnum = pgEnum('waitlist_event_action', waitlistEventActions);
export const registrationReasonEnum = pgEnum('registration_reason', registrationReasons);
