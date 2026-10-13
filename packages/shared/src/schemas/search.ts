import { z } from 'zod';
import { itemSchema } from './item';
import {
  ASK_QUESTION_MAX,
  ASK_QUESTION_MIN,
  SEARCH_LIMIT_DEFAULT,
  SEARCH_LIMIT_MAX,
  SEARCH_Q_MAX,
  searchWhys,
} from '../search/constants';

/** D76: GET /decks/:idOrSlug/search query. */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(SEARCH_Q_MAX),
  limit: z.coerce.number().int().min(1).max(SEARCH_LIMIT_MAX).default(SEARCH_LIMIT_DEFAULT),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchWhySchema = z.enum(searchWhys);

export const searchHitSchema = z.object({
  item: itemSchema,
  why: searchWhySchema,
  score: z.number(),
});
export type SearchHit = z.infer<typeof searchHitSchema>;

export const searchResponseSchema = z.object({
  data: z.array(searchHitSchema),
  /** false when the vector arm did not run (no key, over budget, provider error). */
  semantic: z.boolean(),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

/** D77: POST /decks/:idOrSlug/ask body. */
export const askRequestSchema = z.object({
  question: z.string().trim().min(ASK_QUESTION_MIN).max(ASK_QUESTION_MAX),
});
export type AskRequest = z.infer<typeof askRequestSchema>;

export const askCitationSchema = z.object({
  itemId: z.uuid(),
  title: z.string(),
});
export type AskCitation = z.infer<typeof askCitationSchema>;

export const askResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(askCitationSchema),
  grounded: z.boolean(),
});
export type AskResponse = z.infer<typeof askResponseSchema>;
