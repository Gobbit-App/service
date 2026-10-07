import type { ReactElement } from 'react';

/** A button to toggle an item's favorite status. */
export function FavoriteButton(props: {
  isFavorite: boolean;
  onToggle: () => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <button
      type="button"
      className="icon-button favorite-button"
      aria-pressed={props.isFavorite}
      aria-label={props.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      onClick={props.onToggle}
      disabled={props.disabled}
    >
      <span aria-hidden="true">{props.isFavorite ? '★' : '☆'}</span>
    </button>
  );
}
