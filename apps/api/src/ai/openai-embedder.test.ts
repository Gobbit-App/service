import { describe, expect, it, vi } from 'vitest';
import {
  createOpenAiEmbedder,
  EmbeddingDimensionError,
  type OpenAiEmbeddingsClient,
} from './openai-embedder';

type Create = OpenAiEmbeddingsClient['embeddings']['create'];
type CreateBody = Parameters<Create>[0];
type CreateOptions = Parameters<Create>[1];

/** Response for a batch: vector encodes the text number (`t7` -> [7, 0, 0]). */
function respond(body: CreateBody) {
  return {
    data: body.input.map((text, index) => ({ index, embedding: [Number(text.slice(1)), 0, 0] })),
    usage: { prompt_tokens: body.input.length },
  };
}

function makeClient(
  impl: (body: CreateBody, options?: CreateOptions) => ReturnType<typeof respond> = respond,
) {
  const create = vi.fn(async (body: CreateBody, options?: CreateOptions) => impl(body, options));
  const client: OpenAiEmbeddingsClient = { embeddings: { create } };
  return { client, create };
}

function makeEmbedder(client: OpenAiEmbeddingsClient) {
  return createOpenAiEmbedder({
    apiKey: 'test-key',
    model: 'test-model',
    dims: 3,
    client,
  });
}

describe('createOpenAiEmbedder', () => {
  it('returns empty result without calling the client for empty input', async () => {
    const { client, create } = makeClient();
    const embedder = makeEmbedder(client);

    const result = await embedder.embed([]);

    expect(result).toEqual({ vectors: [], inputTokens: 0 });
    expect(create).not.toHaveBeenCalled();
  });

  it('splits 250 texts into sequential batches of 100, 100, 50', async () => {
    const { client, create } = makeClient();
    const embedder = makeEmbedder(client);
    const texts = Array.from({ length: 250 }, (_, n) => `t${n}`);

    const result = await embedder.embed(texts);

    expect(create).toHaveBeenCalledTimes(3);
    const bodies = create.mock.calls.map((call) => call[0]);
    expect(bodies.map((b) => b.input.length)).toEqual([100, 100, 50]);
    for (const body of bodies) {
      expect(body.model).toBe('test-model');
      expect(body.encoding_format).toBe('float');
    }
    expect(result.vectors).toHaveLength(250);
    expect(result.vectors[0]).toEqual([0, 0, 0]);
    expect(result.vectors[249]).toEqual([249, 0, 0]);
  });

  it('orders vectors by index even when the response is shuffled', async () => {
    const { client } = makeClient((body) => {
      const res = respond(body);
      return { ...res, data: [...res.data].reverse() };
    });
    const embedder = makeEmbedder(client);

    const result = await embedder.embed(['t1', 't2', 't3']);

    expect(result.vectors).toEqual([
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
  });

  it('sums prompt tokens across batches', async () => {
    const { client } = makeClient((body) => ({
      ...respond(body),
      usage: { prompt_tokens: 7 },
    }));
    const embedder = makeEmbedder(client);
    const texts = Array.from({ length: 150 }, (_, n) => `t${n}`);

    const result = await embedder.embed(texts);

    expect(result.inputTokens).toBe(14);
  });

  it('throws EmbeddingDimensionError when a vector has the wrong length', async () => {
    const { client } = makeClient((body) => ({
      data: body.input.map((_text, index) => ({ index, embedding: [1, 2] })),
      usage: { prompt_tokens: body.input.length },
    }));
    const embedder = makeEmbedder(client);

    await expect(embedder.embed(['a'])).rejects.toBeInstanceOf(EmbeddingDimensionError);
  });

  it('propagates client errors unchanged', async () => {
    const boom = new Error('boom');
    const { client } = makeClient(() => {
      throw boom;
    });
    const embedder = makeEmbedder(client);

    await expect(embedder.embed(['a'])).rejects.toBe(boom);
  });

  it('forwards the abort signal to the client', async () => {
    const { client, create } = makeClient();
    const embedder = makeEmbedder(client);
    const controller = new AbortController();

    await embedder.embed(['t1'], { signal: controller.signal });

    expect(create).toHaveBeenCalledWith(expect.anything(), { signal: controller.signal });
  });
});
