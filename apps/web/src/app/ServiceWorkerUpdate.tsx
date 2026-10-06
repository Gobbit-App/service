import { useRegisterSW } from 'virtual:pwa-register/react';
import type { ReactElement } from 'react';
import { UpdatePrompt } from '../ui/StatusViews';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

/** P3.4: offers a reload when a new service worker is waiting; checks hourly while open. */
export function ServiceWorkerUpdate(): ReactElement | null {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
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

  return (
    <UpdatePrompt
      visible={needRefresh}
      onUpdate={() => void updateServiceWorker(true)}
      onDismiss={() => setNeedRefresh(false)}
    />
  );
}
