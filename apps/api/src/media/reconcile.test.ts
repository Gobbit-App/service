import { describe, expect, it } from 'vitest';
import { parseReconcileArgs, unrecorded } from './reconcile';

describe('parseReconcileArgs', () => {
  it('is a dry run by default', () => {
    expect(parseReconcileArgs([])).toEqual({ delete: false });
  });

  it('deletes only with an explicit --delete', () => {
    expect(parseReconcileArgs(['--delete'])).toEqual({ delete: true });
  });

  it('refuses unknown arguments', () => {
    expect(() => parseReconcileArgs(['--delet'])).toThrow(/unknown argument/);
  });
});

describe('unrecorded', () => {
  it('keeps listed ids without a row, once each', () => {
    expect(unrecorded(['a', 'b', 'a', 'c'], new Set(['b']))).toEqual(['a', 'c']);
  });
});
