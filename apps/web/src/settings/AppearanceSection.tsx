import { useId, useState, type ReactElement } from 'react';
import {
  THEME_CHOICES,
  applyTheme,
  readThemeChoice,
  saveThemeChoice,
  type ThemeChoice,
} from '../theme/theme';
import { SettingsSection } from './SettingsSection';

const LABELS: Record<ThemeChoice, string> = {
  system: 'Match device',
  light: 'Light',
  dark: 'Dark',
};

/** D383: Settings → Appearance. The theme is this device's choice, applied at once and kept locally. */
export function AppearanceSection(): ReactElement {
  const [choice, setChoice] = useState<ThemeChoice>(() => readThemeChoice());
  const name = useId();
  const noteId = useId();

  const choose = (next: ThemeChoice) => {
    setChoice(next);
    saveThemeChoice(next);
    applyTheme(next);
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
      <p id={noteId} className="muted">
        Saved on this device.
      </p>
    </SettingsSection>
  );
}
