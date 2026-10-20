import { useId, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';

type Tab = 'edit' | 'preview';
const TABS: { id: Tab; label: string }[] = [
  { id: 'edit', label: 'Edit' },
  { id: 'preview', label: 'Preview' },
];

/**
 * D136: Edit/Preview tabs below 768px, side by side from 768px (the CSS hides the tablist and
 * shows both panels). Both panels stay mounted so the form keeps its state when switching.
 */
export function EditorTabs({
  edit,
  preview,
}: {
  edit: ReactNode;
  preview: ReactNode;
}): ReactElement {
  const id = useId();
  const [active, setActive] = useState<Tab>('edit');
  const tabId = (tab: Tab) => `${id}-tab-${tab}`;
  const panelId = (tab: Tab) => `${id}-panel-${tab}`;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next: Tab = active === 'edit' ? 'preview' : 'edit';
    setActive(next);
    document.getElementById(tabId(next))?.focus();
  };

  return (
    <div className="editor__layout">
      <div className="editor__tabs" role="tablist" aria-label="Editor view" onKeyDown={onKeyDown}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={tabId(tab.id)}
            type="button"
            role="tab"
            className="editor__tab"
            aria-selected={active === tab.id}
            aria-controls={panelId(tab.id)}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {TABS.map((tab) => (
        <div
          key={tab.id}
          id={panelId(tab.id)}
          role="tabpanel"
          aria-labelledby={tabId(tab.id)}
          className={`editor__panel editor__panel--${tab.id}`}
          hidden={active !== tab.id}
        >
          {tab.id === 'edit' ? edit : preview}
        </div>
      ))}
    </div>
  );
}
