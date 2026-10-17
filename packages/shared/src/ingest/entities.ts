import { z } from 'zod';
import { utf8Bytes } from '../utils/utf8-bytes';

/** D97: cross-type facts extracted from a card, stored in `items.entities` and searchable. */
export const entityKinds = [
  'phones',
  'addresses',
  'hours',
  'prices',
  'dates',
  'people',
  'urls',
] as const;
export type EntityKind = (typeof entityKinds)[number];

export const ENTITY_VALUES_MAX = 10;
export const ENTITY_VALUE_MAX = 120;
/** Serialized size limit; the DB CHECK (`octet_length(entities::text)`) is the backstop. */
export const ENTITIES_MAX_BYTES = 2048;

const entityValuesSchema = z
  .array(z.string().trim().min(1).max(ENTITY_VALUE_MAX))
  .max(ENTITY_VALUES_MAX)
  .optional();

export const entitiesSchema = z
  .object({
    phones: entityValuesSchema,
    addresses: entityValuesSchema,
    hours: entityValuesSchema,
    prices: entityValuesSchema,
    dates: entityValuesSchema,
    people: entityValuesSchema,
    urls: entityValuesSchema,
  })
  .strict()
  .refine((v) => utf8Bytes(JSON.stringify(v)) <= ENTITIES_MAX_BYTES, {
    message: `Entities exceed ${ENTITIES_MAX_BYTES} bytes`,
  });

export type Entities = z.infer<typeof entitiesSchema>;

/** Drops empty lists so stored entities stay compact. */
export function compactEntities(entities: Entities): Entities {
  const out: Entities = {};
  for (const kind of entityKinds) {
    const values = entities[kind];
    if (values && values.length > 0) out[kind] = values;
  }
  return out;
}

/** True when at least one kind has a value. */
export function hasEntities(entities: Entities | null | undefined): boolean {
  return !!entities && entityKinds.some((kind) => (entities[kind]?.length ?? 0) > 0);
}
