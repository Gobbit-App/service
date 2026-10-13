import { llmCalls, type Db, type NewLlmCallRow } from '@pb/db';

export function createLlmCallsRepo(db: Db) {
  return {
    async insert(row: NewLlmCallRow): Promise<void> {
      await db.insert(llmCalls).values(row);
    },
  };
}

export type LlmCallsRepo = ReturnType<typeof createLlmCallsRepo>;
