import type { ReactElement } from 'react';
import type { Entities } from '@pb/shared';

const KIND_LABELS: [keyof Entities, string][] = [
  ['phones', 'Phone'],
  ['addresses', 'Address'],
  ['hours', 'Hours'],
  ['prices', 'Price'],
  ['dates', 'Date'],
  ['people', 'Person'],
  ['urls', 'Link'],
];

/** D107: the extracted details, one chip per value, so a reviewer can check them at a glance. */
export function EntityChips({ entities }: { entities: Entities }): ReactElement | null {
  const chips = KIND_LABELS.flatMap(([kind, label]) =>
    (entities[kind] ?? []).map((value) => ({ key: `${kind}:${value}`, label, value })),
  );
  if (chips.length === 0) return null;
  return (
    <ul className="entity-chips" aria-label="Extracted details">
      {chips.map((chip) => (
        <li key={chip.key} className="chip chip--small entity-chips__chip" dir="auto">
          <span className="entity-chips__kind">{chip.label}</span> {chip.value}
        </li>
      ))}
    </ul>
  );
}
