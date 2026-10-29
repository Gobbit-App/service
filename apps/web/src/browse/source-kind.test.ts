import { describe, expect, it } from 'vitest';
import { itemTypes, sourceKinds } from '@gobbit/shared/enums';
import { itemTypeLabel, sourceKindLabel } from './source-kind';

describe('sourceKindLabel', () => {
  it('has a distinct label for every source kind', () => {
    const labels = sourceKinds.map((kind) => sourceKindLabel(kind));
    for (const label of labels) expect(label).toMatch(/\S/);
    expect(new Set(labels).size).toBe(sourceKinds.length);
  });

  it('reads naturally', () => {
    expect(sourceKindLabel('manual')).toBe('Added by hand');
    expect(sourceKindLabel('telegram')).toBe('Sent from Telegram');
  });
});

describe('itemTypeLabel', () => {
  it('has a label for every card type', () => {
    for (const type of itemTypes) expect(itemTypeLabel(type)).toMatch(/\S/);
    expect(itemTypeLabel('calc')).toBe('Calculator');
  });
});
