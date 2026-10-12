import type { AskInput, AskOutput, Asker } from './asker';

export type FakeAskReply = Pick<AskOutput, 'answer' | 'citedItemIds' | 'grounded'>;

/** Test asker: records inputs; default reply cites the first card, grounded. A reply fn may throw to simulate failures. */
export function createFakeAsker(
  reply: (input: AskInput) => FakeAskReply | Promise<FakeAskReply> = defaultReply,
): Asker & { calls: AskInput[] } {
  const calls: AskInput[] = [];
  return {
    provider: 'fake',
    model: 'fake-ask',
    calls,
    async ask(input: AskInput): Promise<AskOutput> {
      calls.push(input);
      const result = await reply(input);
      return {
        answer: result.answer,
        citedItemIds: result.citedItemIds,
        grounded: result.grounded,
        inputTokens: 100,
        outputTokens: 20,
      };
    },
  };
}

function defaultReply(input: AskInput): FakeAskReply {
  return {
    answer: 'fake answer',
    citedItemIds: input.cards.slice(0, 1).map((c) => c.id),
    grounded: input.cards.length > 0,
  };
}
