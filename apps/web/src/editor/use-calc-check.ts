import { useEffect, useState } from 'react';
import type { ItemType } from '@gobbit/shared';
import type { CalcExpressionCheck } from './validate';

type CheckState = { check: CalcExpressionCheck | null; failed: boolean };

/**
 * R6: the calc expression check needs mathjs, so it loads with the calc chunk (the same async
 * chunk as `CalcCard`) only while the draft is a calc card. `ready` is false until it has.
 */
export function useCalcCheck(type: ItemType): {
  check: CalcExpressionCheck | undefined;
  ready: boolean;
  failed: boolean;
} {
  const [state, setState] = useState<CheckState>({ check: null, failed: false });
  const needed = type === 'calc';

  useEffect(() => {
    if (!needed || state.check) return;
    let cancelled = false;
    import('@gobbit/shared/calc')
      .then((module) => {
        if (!cancelled) setState({ check: module.validateCalcExpression, failed: false });
      })
      .catch(() => {
        // The server still validates; the editor says the live check is unavailable.
        if (!cancelled) setState({ check: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [needed, state.check]);

  return {
    check: needed ? (state.check ?? undefined) : undefined,
    ready: !needed || state.check !== null || state.failed,
    failed: needed && state.failed,
  };
}
