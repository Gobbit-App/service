import { describe, expect, it } from 'vitest';
import {
  defaultAsker,
  defaultEmbedder,
  hasAskProvider,
  hasEmbeddingProvider,
  openRouterEmbeddingModel,
  OPENROUTER_DEFAULT_ASK_MODEL,
  type ProviderEnv,
} from './providers';

const base: ProviderEnv = {
  OPENROUTER_API_KEY: undefined,
  OPENAI_API_KEY: undefined,
  ANTHROPIC_API_KEY: undefined,
  EMBEDDING_MODEL: 'text-embedding-3-small',
  ASK_MODEL: undefined,
};

describe('provider flags', () => {
  it('are off without keys', () => {
    expect(hasEmbeddingProvider(base)).toBe(false);
    expect(hasAskProvider(base)).toBe(false);
  });

  it('turn both features on with an OpenRouter key alone', () => {
    const env = { ...base, OPENROUTER_API_KEY: 'or-test' };
    expect(hasEmbeddingProvider(env)).toBe(true);
    expect(hasAskProvider(env)).toBe(true);
  });

  it('map the direct keys to their own feature only', () => {
    expect(hasEmbeddingProvider({ ...base, OPENAI_API_KEY: 'oa-test' })).toBe(true);
    expect(hasAskProvider({ ...base, OPENAI_API_KEY: 'oa-test' })).toBe(false);
    expect(hasAskProvider({ ...base, ANTHROPIC_API_KEY: 'an-test' })).toBe(true);
    expect(hasEmbeddingProvider({ ...base, ANTHROPIC_API_KEY: 'an-test' })).toBe(false);
  });
});

describe('openRouterEmbeddingModel', () => {
  it('prefixes bare OpenAI ids and keeps namespaced ids', () => {
    expect(openRouterEmbeddingModel('text-embedding-3-small')).toBe(
      'openai/text-embedding-3-small',
    );
    expect(openRouterEmbeddingModel('qwen/qwen3-embedding-8b')).toBe('qwen/qwen3-embedding-8b');
  });
});

describe('defaultEmbedder', () => {
  it('is null without a key', () => {
    expect(defaultEmbedder(base)).toBeNull();
  });

  it('prefers OpenRouter and keeps the bare stored model', () => {
    const embedder = defaultEmbedder({
      ...base,
      OPENROUTER_API_KEY: 'or-test',
      OPENAI_API_KEY: 'oa',
    });
    expect(embedder?.provider).toBe('openrouter');
    expect(embedder?.model).toBe('text-embedding-3-small');
  });

  it('falls back to OpenAI', () => {
    expect(defaultEmbedder({ ...base, OPENAI_API_KEY: 'oa-test' })?.provider).toBe('openai');
  });
});

describe('defaultAsker', () => {
  it('is null without a key', () => {
    expect(defaultAsker(base)).toBeNull();
  });

  it('prefers OpenRouter with its Haiku id by default', () => {
    const asker = defaultAsker({ ...base, OPENROUTER_API_KEY: 'or-test', ANTHROPIC_API_KEY: 'an' });
    expect(asker?.provider).toBe('openrouter');
    expect(asker?.model).toBe(OPENROUTER_DEFAULT_ASK_MODEL);
  });

  it('honours ASK_MODEL', () => {
    const asker = defaultAsker({ ...base, OPENROUTER_API_KEY: 'or-test', ASK_MODEL: 'x/y' });
    expect(asker?.model).toBe('x/y');
  });

  it('falls back to Anthropic with the Anthropic default id', () => {
    const asker = defaultAsker({ ...base, ANTHROPIC_API_KEY: 'an-test' });
    expect(asker?.provider).toBe('anthropic');
    expect(asker?.model).toBe('claude-haiku-5-5');
  });
});
