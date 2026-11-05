import { fireEvent, screen } from '@testing-library/react';

/** D303 (039): open a new card's type control and pick a tile by its label. */
export function chooseCardType(label: string): void {
  fireEvent.click(screen.getByRole('button', { name: /^Card type: / }));
  fireEvent.click(screen.getByRole('radio', { name: label }));
}
