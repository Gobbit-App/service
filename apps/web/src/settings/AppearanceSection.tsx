import { useId, useState, type ReactElement } from 'react';
import {
  THEME_CHOICES,
  applyTheme,
  readThemeChoice,
  saveThemeChoice,
  type ThemeChoice,
} from '../theme/theme';
import {
  CATEGORY_ORDERS,
  readCategoryOrder,
  saveCategoryOrder,
  type CategoryOrder,
} from '../ui/category-order';
import { SettingsSection } from './SettingsSection';

const LABELS: Record<ThemeChoice, string> = {
  system: 'Match device',
  light: 'Light',
  dark: 'Dark',
};

const ORDER_LABELS: Record<CategoryOrder, string> = {
  name: 'A–Z',
  oldest: 'Oldest first',
  newest: 'Newest first',
};

/**
 * D383/D402: Settings → Appearance. The theme and the category order are this device's choices,
 * applied at once and kept locally.
 */
export function AppearanceSection(): ReactElement {
  const [choice, setChoice] = useState<ThemeChoice>(() => readThemeChoice());
  const [order, setOrder] = useState<CategoryOrder>(() => readCategoryOrder());
  const name = useId();
  const orderName = useId();
  const noteId = useId();

  const choose = (next: ThemeChoice) => {
    setChoice(next);
    saveThemeChoice(next);
    applyTheme(next);
  };

  const chooseOrder = (next: CategoryOrder) => {
    setOrder(next);
    saveCategoryOrder(next);
  };

  return (
    <SettingsSection title="Appearance">
      <fieldset className="segmented" aria-describedby={noteId}>
        <legend className="segmented__legend">Theme</legend>
        <div className="segmented__options">
          {THEME_CHOICES.map((value) => (
            <label key={value} className="segmented__option">
              <input
                type="radio"
                name={name}
                value={value}
                checked={choice === value}
                onChange={() => choose(value)}
              />
              <span>{LABELS[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="segmented" aria-describedby={noteId}>
        <legend className="segmented__legend">Category order</legend>
        <div className="segmented__options">
          {CATEGORY_ORDERS.map((value) => (
            <label key={value} className="segmented__option">
              <input
                type="radio"
                name={orderName}
                value={value}
                checked={order === value}
                onChange={() => chooseOrder(value)}
              />
              <span>{ORDER_LABELS[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p id={noteId} className="muted">
        Saved on this device.
      </p>
    </SettingsSection>
  );
}
