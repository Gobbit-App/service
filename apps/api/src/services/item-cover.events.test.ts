import { describe, it, expect } from 'vitest';
import { captureLogger, expectDecision } from '../../test/capture-logger';
import { createItemCoverDecisions } from './item-cover.events';

const ids = { requestId: 'req-1', deckId: 'deck-1', actorId: 'user-1' };

describe('item.cover decision events (044)', () => {
  it('logs info with ids only for unsupported_type and unknown_image', async () => {
    const { logger, lines, flush } = captureLogger();
    const decisions = createItemCoverDecisions(logger);
    decisions.refused({ reason: 'unsupported_type', ...ids });
    decisions.refused({ reason: 'unknown_image', itemId: 'item-1', ...ids });
    await flush();
    const a = expectDecision(lines, 'item.cover', {
      outcome: 'refused',
      reason: 'unsupported_type',
    });
    expect(a).toMatchObject({ ...ids, level: 'info', component: 'items' });
    expect(a).not.toHaveProperty('itemId');
    const b = expectDecision(lines, 'item.cover', { outcome: 'refused', reason: 'unknown_image' });
    expect(b).toMatchObject({ ...ids, itemId: 'item-1', level: 'info' });
  });

  it('logs warn for other_deck', async () => {
    const { logger, lines, flush } = captureLogger();
    createItemCoverDecisions(logger).refused({ reason: 'other_deck', ...ids });
    await flush();
    const line = expectDecision(lines, 'item.cover', { outcome: 'refused', reason: 'other_deck' });
    expect(line).toMatchObject({ ...ids, level: 'warn' });
  });
});
