import { describe, it, expect } from 'vitest';
import { captureLogger, expectDecision } from '../../test/capture-logger';
import { createProfileDecisions } from './profile.events';

describe('profile decisions (046)', () => {
  it('records every event with its fields and levels', async () => {
    const { logger, lines, flush } = captureLogger();
    const d = createProfileDecisions(logger);
    const base = { requestId: 'r1', actorId: 'u1' };
    d.record('profile.username', { ...base, outcome: 'claimed', usernameHash: 'h' });
    d.record('profile.username', { ...base, outcome: 'changed', usernameHash: 'h' });
    d.record('profile.username', { ...base, outcome: 'cleared', usernameHash: 'h' });
    d.record('profile.username', {
      ...base,
      outcome: 'refused',
      reason: 'taken',
      usernameHash: 'h',
    });
    d.record('profile.username', {
      ...base,
      outcome: 'refused',
      reason: 'reserved',
      usernameHash: 'h',
    });
    d.record('profile.username_hold', { ...base, outcome: 'held', holdUntil: '2026-12-01' });
    d.record('profile.username_check', {
      ...base,
      outcome: 'refused',
      reason: 'rate_limited',
      queryHash: 'q',
    });
    d.record('profile.lookup', {
      ...base,
      outcome: 'found',
      kind: 'email',
      queryHash: 'q',
      targetId: 'u2',
    });
    d.record('profile.lookup', {
      ...base,
      outcome: 'refused',
      reason: 'rate_limited',
      kind: 'username',
      queryHash: 'q',
    });
    await flush();

    expect(expectDecision(lines, 'profile.username', { outcome: 'claimed' })).toMatchObject({
      component: 'profile',
      usernameHash: 'h',
      actorId: 'u1',
      level: 'info',
    });
    expectDecision(lines, 'profile.username', { outcome: 'changed' });
    expectDecision(lines, 'profile.username', { outcome: 'cleared' });
    expect(
      expectDecision(lines, 'profile.username', { outcome: 'refused', reason: 'taken' }),
    ).toMatchObject({ level: 'info' });
    expect(
      expectDecision(lines, 'profile.username', { outcome: 'refused', reason: 'reserved' }),
    ).toMatchObject({ level: 'warn' });
    expect(expectDecision(lines, 'profile.username_hold', { outcome: 'held' })).toMatchObject({
      holdUntil: '2026-12-01',
    });
    expect(
      expectDecision(lines, 'profile.username_check', {
        outcome: 'refused',
        reason: 'rate_limited',
      }),
    ).toMatchObject({ queryHash: 'q' });
    expect(expectDecision(lines, 'profile.lookup', { outcome: 'found' })).toMatchObject({
      kind: 'email',
      targetId: 'u2',
    });
    expect(
      expectDecision(lines, 'profile.lookup', { outcome: 'refused', reason: 'rate_limited' }),
    ).toMatchObject({ kind: 'username' });
  });
});
