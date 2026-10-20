import type { ReactElement } from 'react';
import type { Entities } from '@pb/shared';

export type EntityKind = keyof Entities;

const KIND_LABELS: [EntityKind, string][] = [
  ['phones', 'Phone'],
  ['addresses', 'Address'],
  ['hours', 'Hours'],
  ['prices', 'Price'],
  ['dates', 'Date'],
  ['people', 'Person'],
  ['urls', 'Link'],
];

/**
 * D107: the extracted details, one chip per value, so a reviewer can check them at a glance.
 * With `onRemove` (the editor, FR-012) each chip gets a remove button; details are never added.
 */
export function EntityChips({
  entities,
  onRemove,
}: {
  entities: Entities;
  onRemove?: (kind: EntityKind, index: number) => void;
}): ReactElement | null {
  const chips = KIND_LABELS.flatMap(([kind, label]) =>
    (entities[kind] ?? []).map((value, index) => ({
      key: `${kind}:${index}:${value}`,
      kind,
      index,
      label,
      value,
    })),
  );
  if (chips.length === 0) return null;
  return (
    <ul className="entity-chips" aria-label="Extracted details">
      {chips.map((chip) => (
        <li key={chip.key} className="chip chip--small entity-chips__chip" dir="auto">
          <span className="entity-chips__kind">{chip.label}</span> {chip.value}
          {onRemove && (
            <button
              type="button"
              className="entity-chips__remove"
              aria-label={`Remove ${chip.label} ${chip.value}`}
              onClick={() => onRemove(chip.kind, chip.index)}
            >
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The entities without one value (remove-only editing). */
export function removeEntity(entities: Entities, kind: EntityKind, index: number): Entities {
  const values = entities[kind] ?? [];
  return { ...entities, [kind]: values.filter((_, i) => i !== index) };
}
