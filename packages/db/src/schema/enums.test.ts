import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  deckKindEnum,
  categoryVisibilityEnum,
  itemTypeEnum,
  itemStatusEnum,
  sourceKindEnum,
  memberRoleEnum,
  magicLinkPurposeEnum,
  sessionKindEnum,
} from './common';
import { items } from './items';
import {
  deckKinds,
  categoryVisibilities,
  itemTypes,
  itemStatuses,
  sourceKinds,
  memberRoles,
  magicLinkPurposes,
  sessionKinds,
} from '@pb/shared';

describe('schema enums', () => {
  it('deckKindEnum.enumValues equals deckKinds', () => {
    expect(deckKindEnum.enumValues).toEqual(deckKinds);
  });

  it('categoryVisibilityEnum.enumValues equals categoryVisibilities', () => {
    expect(categoryVisibilityEnum.enumValues).toEqual(categoryVisibilities);
  });

  it('itemTypeEnum.enumValues equals itemTypes', () => {
    expect(itemTypeEnum.enumValues).toEqual(itemTypes);
  });

  it('itemStatusEnum.enumValues equals itemStatuses', () => {
    expect(itemStatusEnum.enumValues).toEqual(itemStatuses);
  });

  it('sourceKindEnum.enumValues equals sourceKinds', () => {
    expect(sourceKindEnum.enumValues).toEqual(sourceKinds);
  });

  it('memberRoleEnum.enumValues equals memberRoles', () => {
    expect(memberRoleEnum.enumValues).toEqual(memberRoles);
  });

  it('magicLinkPurposeEnum.enumValues equals magicLinkPurposes', () => {
    expect(magicLinkPurposeEnum.enumValues).toEqual(magicLinkPurposes);
  });

  it('sessionKindEnum.enumValues equals sessionKinds', () => {
    expect(sessionKindEnum.enumValues).toEqual(sessionKinds);
  });

  describe('items table checks', () => {
    it('should have items_body_len_chk, items_payload_size_chk, and items_payload_object_chk', () => {
      const config = getTableConfig(items);
      const checkNames = config.checks?.map((check) => check.name) ?? [];

      expect(checkNames).toContain('items_body_len_chk');
      expect(checkNames).toContain('items_payload_size_chk');
      expect(checkNames).toContain('items_payload_object_chk');
    });
  });
});
