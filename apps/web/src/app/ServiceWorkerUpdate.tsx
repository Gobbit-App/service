import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect, useState, type ReactElement } from 'react';
import { UpdatePrompt } from '../ui/StatusViews';
import { setPendingUpdate } from './sw-update-store';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * P3.4: offers a reload when a new service worker is waiting; checks hourly while open.
 * "Later" only hides the prompt: the update stays pending in the ⋯ menu and About.
 */
export function ServiceWorkerUpdate(): ReactElement | null {
  const [dismissed, setDismissed] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => {
        registration.update().catch((err: unknown) => {
          console.warn('[sw] update check failed', err);
        });
      }, UPDATE_CHECK_MS);
    },
    onRegisterError(err: unknown) {
      console.error('[sw] registration failed', err);
    },
  });

  useEffect(() => {
    setPendingUpdate(needRefresh ? () => void updateServiceWorker(true) : null);
  }, [needRefresh, updateServiceWorker]);

  return (
    <UpdatePrompt
      visible={needRefresh && !dismissed}
      onUpdate={() => void updateServiceWorker(true)}
      onDismiss={() => setDismissed(true)}
    />
  );
}
