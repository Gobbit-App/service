import { useId, useState, type ReactElement } from 'react';
import type { ItemType } from '@gobbit/shared';
import { supportsCover } from '@gobbit/shared/card-cover';
import { Icon } from '../../ui/icons/Icon';
import { Sheet } from '../../ui/sheet/Sheet';
import { isCreatableType, type CreatableType } from '../creatable-types';
import { SwitchTypeConfirm } from './SwitchTypeConfirm';
import { TYPE_ICONS, TYPE_LABELS } from './type-tiles';
import { TypeTiles } from './TypeTiles';

type Step = { kind: 'closed' } | { kind: 'choosing' } | { kind: 'confirming'; to: CreatableType };

/**
 * D303 (039): a new card's type, at the top of the writing area. It opens the type tiles in a
 * sheet; when the card holds content the new type can't keep, a second sheet asks first.
 *
 * A select-like disclosure (icon, type and chevron always visible), so it is its own control
 * rather than a `ui/buttons` action, like the editor's tabs before it.
 */
export function TypeControl({
  value,
  hasContent,
  hasCover = false,
  imagesOff,
  disabled = false,
  onChange,
}: {
  value: ItemType;
  /** `payloadHasContent(draft)`: switching would remove something. */
  hasContent: boolean;
  /** 044: the draft has a cover image; link and image cards can't keep it. */
  hasCover?: boolean;
  imagesOff: boolean;
  disabled?: boolean;
  onChange: (type: CreatableType) => void;
}): ReactElement {
  const [step, setStep] = useState<Step>({ kind: 'closed' });
  const titleId = useId();
  const close = () => setStep({ kind: 'closed' });

  const pick = (type: CreatableType) => {
    if (type === value) return close();
    if (hasContent || (hasCover && !supportsCover(type)))
      return setStep({ kind: 'confirming', to: type });
    close();
    onChange(type);
  };

  return (
    <>
      <button
        type="button"
        className="type-control"
        aria-label={`Card type: ${TYPE_LABELS[value]}`}
        aria-haspopup="dialog"
        aria-disabled={disabled ? true : undefined}
        onClick={() => {
          if (!disabled) setStep({ kind: 'choosing' });
        }}
      >
        <Icon name={TYPE_ICONS[value]} />
        <span>{TYPE_LABELS[value]}</span>
        <Icon name="chevron-down" className="type-control__chevron" />
      </button>
      {step.kind === 'choosing' && (
        <Sheet labelledBy={titleId} onClose={close} className="type-sheet">
          <h2 id={titleId} className="sheet__title">
            Choose a card type
          </h2>
          <TypeTiles
            value={isCreatableType(value) ? value : null}
            onPick={pick}
            imagesOff={imagesOff}
            autoFocus
          />
        </Sheet>
      )}
      {step.kind === 'confirming' && (
        <SwitchTypeConfirm
          from={value}
          to={step.to}
          coverRemoved={hasCover && !supportsCover(step.to)}
          onKeep={close}
          onSwitch={() => {
            close();
            onChange(step.to);
          }}
        />
      )}
    </>
  );
}

/** D303: on an existing card the type is fixed; it is shown, not offered. */
export function TypeLabel({ type }: { type: ItemType }): ReactElement {
  return (
    <p className="type-label">
      <Icon name={TYPE_ICONS[type]} />
      <span>{TYPE_LABELS[type]} card</span>
    </p>
  );
}
