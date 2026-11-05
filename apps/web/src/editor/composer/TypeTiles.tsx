import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { Icon } from '../../ui/icons/Icon';
import { CREATABLE_TYPES, type CreatableType } from '../creatable-types';
import { rovingIndex } from './roving-index';
import { IMAGES_UNAVAILABLE, TYPE_HINTS, TYPE_ICONS, TYPE_LABELS } from './type-tiles';
import './type-tiles.css';

export type TypeTilesProps = {
  /** The checked type (the type control), or null on the chooser where nothing is picked yet. */
  value: CreatableType | null;
  onPick: (type: CreatableType) => void;
  /** FR-015: the Image tile is aria-disabled and says why. */
  imagesOff: boolean;
  /** Focus the checked (else first) tile on mount. */
  autoFocus?: boolean;
};

/**
 * D301 (039): the card types as a named single-choice group of tiles. Arrows (wrapping) and
 * Home/End move focus only; Enter, Space, a tap or a click picks, because picking starts writing.
 */
export function TypeTiles({
  value,
  onPick,
  imagesOff,
  autoFocus = false,
}: TypeTilesProps): ReactElement {
  const id = useId();
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);
  const start = Math.max(0, value ? CREATABLE_TYPES.indexOf(value) : 0);
  const [focusIndex, setFocusIndex] = useState(start);

  useEffect(() => {
    if (!autoFocus) return;
    // After the enclosing Sheet's own mount effect has opened its dialog (parents' effects run
    // after children's), so the tile is focusable and the sheet returns focus to its opener.
    queueMicrotask(() => tiles.current[start]?.focus());
    // Mount only: the group takes focus once when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = rovingIndex(event.key, focusIndex, CREATABLE_TYPES.length);
    if (next === null) return;
    event.preventDefault();
    setFocusIndex(next);
    tiles.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="Card type" className="type-tiles" onKeyDown={onKeyDown}>
      {CREATABLE_TYPES.map((type, index) => {
        const unavailable = type === 'image' && imagesOff;
        const nameId = `${id}-${type}-name`;
        const hintId = `${id}-${type}-hint`;
        return (
          <button
            key={type}
            ref={(el) => {
              tiles.current[index] = el;
            }}
            type="button"
            role="radio"
            className="type-tile"
            aria-checked={value === type}
            aria-disabled={unavailable ? true : undefined}
            aria-labelledby={nameId}
            aria-describedby={hintId}
            tabIndex={index === focusIndex ? 0 : -1}
            onFocus={() => setFocusIndex(index)}
            onClick={() => {
              if (!unavailable) onPick(type);
            }}
          >
            <Icon name={TYPE_ICONS[type]} className="type-tile__icon" />
            <span id={nameId} className="type-tile__name">
              {TYPE_LABELS[type]}
            </span>
            <span id={hintId} className="type-tile__hint">
              {unavailable ? IMAGES_UNAVAILABLE : TYPE_HINTS[type]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
