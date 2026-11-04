import { useCallback, useEffect, useMemo, useState } from 'react';
import { sendTestPush } from '../api/notifications';
import {
  browserPushDeps,
  currentSubscription,
  disablePush,
  enablePush,
  PushPermissionDenied,
  type PushClientDeps,
} from './push-client';
import { browserPushEnvironment, pushSupport, type PushSupport } from './push-support';

export type PushNotice = 'enabled' | 'disabled' | 'denied' | 'failed' | { tested: number };

export type PushState = {
  support: PushSupport;
  /** null while the current subscription is being read. */
  subscribed: boolean | null;
  busy: boolean;
  notice: PushNotice | null;
  enable: () => void;
  disable: () => void;
  test: () => void;
};

type Options = {
  deps?: PushClientDeps;
  support?: () => PushSupport;
  test?: () => Promise<{ devices: number }>;
};

const detectSupport = () =>
  pushSupport(
    browserPushEnvironment(),
    typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
  );

/** 037 (D297): this device's push state and the Settings actions around it. */
export function usePush(publicKey: string, options: Options = {}): PushState {
  const deps = useMemo(() => options.deps ?? browserPushDeps(), [options.deps]);
  const readSupport = options.support ?? detectSupport;
  const runTest = options.test ?? sendTestPush;
  const [support, setSupport] = useState<PushSupport>(readSupport);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<PushNotice | null>(null);

  useEffect(() => {
    if (support !== 'ready') return;
    let live = true;
    currentSubscription(deps)
      .then((s) => live && setSubscribed(s !== null))
      .catch((err: unknown) => {
        console.error('[push] could not read the subscription', err);
        if (live) setSubscribed(false);
      });
    return () => {
      live = false;
    };
  }, [deps, support]);

  const run = useCallback(async (action: () => Promise<PushNotice>) => {
    setBusy(true);
    setNotice(null);
    try {
      setNotice(await action());
    } catch (err) {
      if (err instanceof PushPermissionDenied) {
        setSupport(readSupport());
        setNotice('denied');
      } else {
        console.error('[push] action failed', err);
        setNotice('failed');
      }
    } finally {
      setBusy(false);
    }
    // readSupport is stable for a mounted section.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    support,
    // Only a ready device can have a subscription worth showing.
    subscribed: support === 'ready' ? subscribed : false,
    busy,
    notice,
    enable: () =>
      void run(async () => {
        await enablePush(deps, publicKey);
        setSubscribed(true);
        return 'enabled';
      }),
    disable: () =>
      void run(async () => {
        await disablePush(deps);
        setSubscribed(false);
        return 'disabled';
      }),
    test: () =>
      void run(async () => {
        const { devices } = await runTest();
        return { tested: devices };
      }),
  };
}
