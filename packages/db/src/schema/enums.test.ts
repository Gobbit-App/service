import { describe, it, expect } from 'vitest';
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
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
import { actorViaEnum, itemEventKindEnum, itemEvents } from './item-events';
import {
  deckKinds,
  categoryVisibilities,
  itemTypes,
  itemStatuses,
  sourceKinds,
  memberRoles,
  magicLinkPurposes,
  sessionKinds,
  actorVias,
  itemEventKinds,
  itemEventKindsWithChanges,
  ingestFailureCodes,
  autoPublishOutcomes,
} from '@pb/shared';
import { ingestJobs } from './ingest-jobs';

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

  it('actorViaEnum.enumValues equals actorVias', () => {
    expect(actorViaEnum.enumValues).toEqual(actorVias);
  });

  it('itemEventKindEnum.enumValues equals itemEventKinds', () => {
    expect(itemEventKindEnum.enumValues).toEqual(itemEventKinds);
  });

  it('item_events_changes_chk names exactly the kinds that carry changes (D186)', () => {
    const chk = getTableConfig(itemEvents).checks.find((c) => c.name === 'item_events_changes_chk');
    const sqlText = new PgDialect().sqlToQuery(chk!.value).sql;
    for (const kind of itemEventKindsWithChanges) expect(sqlText).toContain(`'${kind}'`);
    expect(sqlText.match(/'[a-z]+'/g)).toHaveLength(itemEventKindsWithChanges.length);
  });

  it.each([
    ['ingest_jobs_failure_code_chk', ingestFailureCodes],
    ['ingest_jobs_auto_publish_chk', autoPublishOutcomes],
  ] as const)('%s names exactly the shared values (D194, D193)', (name, values) => {
    const chk = getTableConfig(ingestJobs).checks.find((c) => c.name === name);
    const sqlText = new PgDialect().sqlToQuery(chk!.value).sql;
    for (const value of values) expect(sqlText).toContain(`'${value}'`);
    expect(sqlText.match(/'[a-z_]+'/g)).toHaveLength(values.length);
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
