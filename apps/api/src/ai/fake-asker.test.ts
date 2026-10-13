import { describe, expect, it } from 'vitest';
import { createFakeAsker } from './fake-asker';
import type { AskInput } from './asker';

const cards = [
  { id: 'item-1', title: 'First', body: 'alpha', details: '' },
  { id: 'item-2', title: 'Second', body: 'beta', details: '' },
];

function makeInput(overrides: Partial<AskInput> = {}): AskInput {
  return {
    question: 'what is alpha?',
    cards,
    language: 'latin',
    ...overrides,
  };
}

describe('createFakeAsker', () => {
  it('exposes fake provider and model', () => {
    const asker = createFakeAsker();
    expect(asker.provider).toBe('fake');
    expect(asker.model).toBe('fake-ask');
  });

  it('default reply cites the first card and is grounded', async () => {
    const asker = createFakeAsker();
    const out = await asker.ask(makeInput());

    expect(out.answer).toBe('fake answer');
    expect(out.citedItemIds).toEqual(['item-1']);
    expect(out.grounded).toBe(true);
    expect(out.inputTokens).toBe(100);
    expect(out.outputTokens).toBe(20);
  });

  it('with no cards, is not grounded and cites nothing', async () => {
    const asker = createFakeAsker();
    const out = await asker.ask(makeInput({ cards: [] }));

    expect(out.citedItemIds).toEqual([]);
    expect(out.grounded).toBe(false);
  });

  it('uses a custom reply when provided', async () => {
    const asker = createFakeAsker(() => ({
      answer: 'custom',
      citedItemIds: ['item-2'],
      grounded: false,
    }));
    const out = await asker.ask(makeInput());

    expect(out.answer).toBe('custom');
    expect(out.citedItemIds).toEqual(['item-2']);
    expect(out.grounded).toBe(false);
    expect(out.inputTokens).toBe(100);
    expect(out.outputTokens).toBe(20);
  });

  it('awaits an async custom reply', async () => {
    const asker = createFakeAsker(async (input) => ({
      answer: `saw ${input.cards.length} cards`,
      citedItemIds: [],
      grounded: true,
    }));
    const out = await asker.ask(makeInput());

    expect(out.answer).toBe('saw 2 cards');
  });

  it('records every input in calls, in order', async () => {
    const asker = createFakeAsker();
    const first = makeInput({ question: 'one' });
    const second = makeInput({ question: 'two', language: 'greek' });

    await asker.ask(first);
    await asker.ask(second);

    expect(asker.calls).toHaveLength(2);
    expect(asker.calls[0]).toBe(first);
    expect(asker.calls[1]).toBe(second);
  });

  it('does not record a call that rejects before recording? records then rejects', async () => {
    const asker = createFakeAsker(() => {
      throw new Error('boom');
    });
    await expect(asker.ask(makeInput())).rejects.toThrow('boom');
    expect(asker.calls).toHaveLength(1);
  });

  it('a thrown reply rejects the ask promise', async () => {
    const asker = createFakeAsker(() => {
      throw new Error('simulated failure');
    });
    await expect(asker.ask(makeInput())).rejects.toThrow('simulated failure');
  });

  it('a rejected async reply rejects the ask promise', async () => {
    const asker = createFakeAsker(async () => {
      throw new Error('async failure');
    });
    await expect(asker.ask(makeInput())).rejects.toThrow('async failure');
  });
});
