import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  pocketbookKindEnum,
  categoryVisibilityEnum,
  itemTypeEnum,
  itemStatusEnum,
  sourceKindEnum,
} from './common';
import { items } from './items';
import {
  pocketbookKinds,
  categoryVisibilities,
  itemTypes,
  itemStatuses,
  sourceKinds,
} from '@pb/shared';

describe('schema enums', () => {
  it('pocketbookKindEnum.enumValues equals pocketbookKinds', () => {
    expect(pocketbookKindEnum.enumValues).toEqual(pocketbookKinds);
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
