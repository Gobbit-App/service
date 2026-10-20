import { lazy, type ComponentType } from 'react';
import type { ItemType } from '@pb/shared';
import { LinkFields } from './LinkFields';
import { ImageFields } from './ImageFields';
import { TextFields } from './TextFields';
import type { FieldsProps } from './types';

/** Table and calc load on demand; calc shares the mathjs chunk with `CalcCard` (R5). */
const TableFields = lazy(async () => ({ default: (await import('./TableFields')).TableFields }));
const CalcFields = lazy(async () => ({ default: (await import('./CalcFields')).CalcFields }));

/**
 * D138: one payload editor per card type (`image` since 008, D133).
 * Typed loosely at the seam; each entry is typed against its own payload.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fieldsByType: Record<ItemType, ComponentType<FieldsProps<any>>> = {
  text: TextFields,
  link: LinkFields,
  image: ImageFields,
  table: TableFields,
  calc: CalcFields,
};
