import type { ReactElement } from 'react';
import {
  COLOR_CLASS,
  PALETTE_COLORS,
  colorClass,
  type PaletteColor,
} from '@gobbit/shared/rich-text';
import { IconButton } from '../../ui/buttons/IconButton';

const COLOR_LABELS: Record<PaletteColor, string> = {
  red: 'Red',
  orange: 'Orange',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
  grey: 'Grey',
};

/**
 * D290: `Default` plus the six palette colours (D287). Each swatch is the text-colour icon drawn
 * in its colour, so the picker shows exactly what the card will.
 */
export function ColorPicker({
  active,
  onPick,
}: {
  active: PaletteColor | null;
  onPick: (color: PaletteColor | null) => void;
}): ReactElement {
  return (
    <div className="rich-editor__panel" role="group" aria-label="Text colour">
      <IconButton
        icon="text-color"
        label="Default colour"
        pressed={active === null}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onPick(null)}
      />
      {PALETTE_COLORS.map((color) => (
        <IconButton
          key={color}
          icon="text-color"
          label={COLOR_LABELS[color]}
          className={`${COLOR_CLASS} ${colorClass(color)}`}
          pressed={active === color}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(color)}
        />
      ))}
    </div>
  );
}
