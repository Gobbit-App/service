import { Fragment, useEffect, useRef, useState, type ReactElement } from 'react';
import type { Command, EditorState } from '@milkdown/kit/prose/state';
import { IconButton } from '../../ui/buttons/IconButton';
import { ColorPicker } from './ColorPicker';
import { LinkRow } from './LinkRow';
import { activeColor, activeHref, removeLink, setColor, setLink } from './commands';
import {
  TOOLBAR_GROUPS,
  isToggle,
  shortcutText,
  type Panel,
  type ToolbarItem,
} from './toolbar-items';
import { useRovingFocus } from './use-roving-focus';

const ITEMS: ToolbarItem[] = TOOLBAR_GROUPS.flatMap((group) => group.items);

/**
 * D290 / FR-008–FR-009: the formatting toolbar. One tab stop with roving focus, grouped
 * `IconButton`s whose pressed state follows the selection, and the colour/link panels under it.
 * Buttons keep the editor's selection (`mousedown` never takes focus from it).
 */
export function FormatToolbar({
  state,
  run,
  focusEditor,
  controls,
  disabled = false,
}: {
  state: EditorState;
  /** Runs a command on the editor and gives it focus back. */
  run: (command: Command) => void;
  focusEditor: () => void;
  /** The id of the editable area. */
  controls: string;
  disabled?: boolean;
}): ReactElement {
  const toolbar = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const roving = useRovingFocus(toolbar, ITEMS.length);

  const closePanel = () => {
    setPanel(null);
    focusEditor();
  };

  /*
   * D310: Escape closes an open panel first, wherever focus is. Capture phase on the document, so
   * it runs before the panel's own handlers and the composer's page-level Escape (which skips a
   * handled event).
   */
  const panelOpen = panel !== null;
  useEffect(() => {
    if (!panelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setPanel(null);
      focusEditor();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [panelOpen, focusEditor]);
  const runAndClose = (command: Command) => {
    setPanel(null);
    run(command);
  };

  const press = (item: ToolbarItem) => {
    if (item.panel) setPanel((open) => (open === item.panel ? null : item.panel!));
    else if (item.command) run(item.command);
  };

  let index = 0;
  return (
    <div className="rich-editor__bar">
      <div
        ref={toolbar}
        className="rich-editor__toolbar"
        role="toolbar"
        aria-label="Formatting"
        aria-controls={controls}
        onKeyDown={roving.onKeyDown}
      >
        {TOOLBAR_GROUPS.map((group, groupIndex) => (
          <Fragment key={group.label}>
            {groupIndex > 0 && <span className="rich-editor__divider" aria-hidden="true" />}
            <div className="rich-editor__group" role="group" aria-label={group.label}>
              {group.items.map((item) => {
                const at = index++;
                const reason = disabled
                  ? 'The editor is busy'
                  : (item.unavailable?.(state) ?? null);
                return (
                  <IconButton
                    key={item.key}
                    data-roving=""
                    icon={item.icon}
                    label={item.label}
                    tip={
                      item.shortcut ? `${item.label} (${shortcutText(item.shortcut)})` : undefined
                    }
                    pressed={isToggle(item) ? item.pressed(state) : undefined}
                    aria-expanded={item.panel ? panel === item.panel : undefined}
                    disabledReason={reason}
                    tabIndex={roving.tabIndexFor(at)}
                    onFocus={() => roving.onFocusIndex(at)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => press(item)}
                  />
                );
              })}
            </div>
          </Fragment>
        ))}
      </div>
      {panel === 'color' && !disabled && (
        <ColorPicker active={activeColor(state)} onPick={(color) => runAndClose(setColor(color))} />
      )}
      {panel === 'link' && !disabled && (
        <LinkRow
          href={activeHref(state)}
          onApply={(href) => runAndClose(setLink(href))}
          onRemove={() => runAndClose(removeLink)}
          onClose={closePanel}
        />
      )}
    </div>
  );
}
