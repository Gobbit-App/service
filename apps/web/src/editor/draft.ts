import type { Entities, Item, ItemCreateInput, ItemPatch, ItemType } from '@gobbit/shared';
import {
  asCalcPayload,
  asTablePayload,
  type ImagePayload,
  type TablePayload,
} from '../cards/payload-guards';
import { normalizeUrlInput } from '../lib/url-input';
import { jsonEqual, sameIds } from './equal';

/** Link payload while editing; unknown keys (e.g. `preview.image` from ingest) are kept. */
export type LinkDraftPayload = {
  url: string;
  preview?: {
    title?: string;
    description?: string;
    image?: string;
    /** 015 "Add photo": a recorded asset of the deck; `null` asks the server to remove it. */
    publicId?: string | null;
    width?: number;
    height?: number;
  };
  [key: string]: unknown;
};

/** A calc field while editing: unit and default are text inputs ('' = none). */
export type CalcDraftField = { key: string; label: string; unit: string; default: string };

export type CalcDraftPayload = {
  fields: CalcDraftField[];
  expression: string;
  resultLabel: string;
};

export type DraftPayloadByType = {
  text: Record<string, never>;
  link: LinkDraftPayload;
  image: ImagePayload;
  table: TablePayload;
  calc: CalcDraftPayload;
};

export type DraftPayload = DraftPayloadByType[ItemType];

/** D137: what the editor holds for any card type (create, edit and the review inline edit). */
export type Draft = {
  type: ItemType;
  title: string;
  body: string;
  payload: DraftPayload;
  categoryIds: string[];
  /** '' = none. */
  sourceUrl: string;
  /** Remove-only (FR-012). */
  entities: Entities | null;
};

export { CREATABLE_TYPES, isCreatableType, type CreatableType } from './creatable-types';

/** A fresh payload for a type. */
export function emptyPayload(type: ItemType): DraftPayload {
  switch (type) {
    case 'text':
      return {};
    case 'link':
      return { url: '' };
    case 'image':
      return { publicId: '', alt: '' };
    case 'table':
      return { columns: ['', ''], rows: [['', '']] };
    case 'calc':
      return {
        fields: [{ key: 'a', label: '', unit: '', default: '' }],
        expression: '',
        resultLabel: '',
      };
  }
}

export function emptyDraft(type: ItemType, defaultCategoryId: string | null): Draft {
  return {
    type,
    title: '',
    body: '',
    payload: emptyPayload(type),
    categoryIds: defaultCategoryId ? [defaultCategoryId] : [],
    sourceUrl: '',
    entities: null,
  };
}

/** Switches a new card's type: the payload resets, title/body/categories stay. */
export function withType(draft: Draft, type: ItemType): Draft {
  return draft.type === type ? draft : { ...draft, type, payload: emptyPayload(type) };
}

function calcFieldToDraft(field: {
  key: string;
  label: string;
  unit?: string;
  default?: number;
}): CalcDraftField {
  return {
    key: field.key,
    label: field.label,
    unit: field.unit ?? '',
    default: field.default === undefined ? '' : String(field.default),
  };
}

function payloadFromItem(item: Item): DraftPayload {
  const raw = item.payload;
  switch (item.type) {
    case 'text':
      return {};
    case 'link': {
      const url = typeof raw['url'] === 'string' ? raw['url'] : '';
      return { ...structuredClone(raw), url } as LinkDraftPayload;
    }
    case 'image':
      return structuredClone(raw) as ImagePayload;
    case 'table':
      // Pads rows shorter than the column count (and trims longer ones) so a save is valid.
      return asTablePayload(raw) ?? emptyPayload('table');
    case 'calc': {
      const calc = asCalcPayload(raw);
      if (!calc) return emptyPayload('calc');
      return {
        fields: calc.fields.map(calcFieldToDraft),
        expression: calc.expression,
        resultLabel: calc.resultLabel,
      };
    }
  }
}

export function draftFromItem(item: Item): Draft {
  return {
    type: item.type,
    title: item.title,
    body: item.body,
    payload: payloadFromItem(item),
    categoryIds: [...item.categoryIds],
    sourceUrl: item.sourceUrl ?? '',
    entities: item.entities ? structuredClone(item.entities) : null,
  };
}

/** Parses a calc default input: '' → undefined, anything else → a number (NaN when invalid). */
export function parseCalcDefault(text: string): number | undefined {
  const trimmed = text.trim();
  return trimmed === '' ? undefined : Number(trimmed);
}

function linkPayload(p: LinkDraftPayload): Record<string, unknown> {
  const { preview, ...rest } = p;
  const out: Record<string, unknown> = { ...rest, url: normalizeUrlInput(p.url) };
  const cleaned: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(preview ?? {})) {
    if (typeof value === 'string' && value.trim() !== '') cleaned[key] = value;
  }
  // Dimensions are server-owned; an explicit `publicId: null` removes the photo (015).
  if (preview?.publicId === null) cleaned['publicId'] = null;
  if (Object.keys(cleaned).length > 0) out['preview'] = cleaned;
  return out;
}

function calcPayload(p: CalcDraftPayload): Record<string, unknown> {
  return {
    fields: p.fields.map((f) => {
      const field: Record<string, unknown> = { key: f.key.trim(), label: f.label };
      if (f.unit.trim() !== '') field['unit'] = f.unit;
      const parsed = parseCalcDefault(f.default);
      if (parsed !== undefined) field['default'] = parsed;
      return field;
    }),
    expression: p.expression.trim(),
    resultLabel: p.resultLabel,
  };
}

/** D206: a blank description is omitted; the renderers fall back to the title. */
function imagePayload(p: ImagePayload): Record<string, unknown> {
  const { alt, ...rest } = p;
  return alt === undefined || alt.trim() === '' ? rest : { ...rest, alt };
}

/**
 * The payload as the API expects it (normalised URL, D205; empty preview keys, unit, default and
 * image description dropped).
 */
export function toPayload(draft: Pick<Draft, 'type' | 'payload'>): Record<string, unknown> {
  switch (draft.type) {
    case 'text':
      return {};
    case 'link':
      return linkPayload(draft.payload as LinkDraftPayload);
    case 'calc':
      return calcPayload(draft.payload as CalcDraftPayload);
    case 'image':
      return imagePayload(draft.payload as ImagePayload);
    case 'table':
      return draft.payload as Record<string, unknown>;
  }
}

/** Drops empty kinds so a removal compares and saves compactly. */
export function compactDraftEntities(entities: Entities | null): Entities {
  const out: Record<string, string[]> = {};
  for (const [kind, values] of Object.entries(entities ?? {})) {
    if (Array.isArray(values) && values.length > 0) out[kind] = values;
  }
  return out as Entities;
}

/** POST body for a new card. No `status`: the server default applies (published). */
export function toCreateBody(draft: Draft): ItemCreateInput {
  const body: Record<string, unknown> = {
    type: draft.type,
    title: draft.title.trim(),
    body: draft.body,
    payload: toPayload(draft),
    categoryIds: [...draft.categoryIds],
  };
  const sourceUrl = normalizeUrlInput(draft.sourceUrl);
  if (sourceUrl !== '') body['sourceUrl'] = sourceUrl;
  return body as ItemCreateInput;
}

/**
 * Minimal PATCH (D107/D137): only changed fields, `null` when nothing changed. The whole payload
 * on any payload change, the whole entities after a removal, `sourceUrl: null` when cleared.
 * Never `type` or `status`.
 */
export function toPatch(original: Item, draft: Draft): ItemPatch | null {
  const base = draftFromItem(original);
  const patch: ItemPatch = {};

  const title = draft.title.trim();
  if (title !== original.title) patch.title = title;
  if (draft.body !== original.body) patch.body = draft.body;

  // The type is immutable: the payload is always read as the original's type.
  const payload = toPayload({ type: original.type, payload: draft.payload });
  if (!jsonEqual(payload, toPayload(base))) patch.payload = payload;

  if (!sameIds(draft.categoryIds, original.categoryIds)) patch.categoryIds = [...draft.categoryIds];

  const sourceUrl = normalizeUrlInput(draft.sourceUrl);
  if (sourceUrl !== (original.sourceUrl ?? '')) {
    patch.sourceUrl = sourceUrl === '' ? null : sourceUrl;
  }

  const entities = compactDraftEntities(draft.entities);
  if (!jsonEqual(entities, compactDraftEntities(base.entities))) patch.entities = entities;

  return Object.keys(patch).length > 0 ? patch : null;
}

/** True when the draft differs from its starting point (structurally). */
export function isDirty(draft: Draft, base: Draft): boolean {
  return !jsonEqual(draft, base);
}
