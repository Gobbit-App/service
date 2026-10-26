import type { ReactElement } from 'react';
import { IconButton } from './buttons/IconButton';

/** A button to toggle an item's favorite status (outline star; filled while favorite). */
export function FavoriteButton(props: {
  isFavorite: boolean;
  onToggle: () => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <IconButton
      icon="star"
      className="favorite-button"
      pressed={props.isFavorite}
      label={props.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      tip={props.isFavorite ? 'Favorite' : 'Add to favorites'}
      onClick={props.onToggle}
      disabled={props.disabled}
    />
  );
}
