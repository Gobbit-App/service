import { describe, expect, it } from 'vitest';
import {
  INGEST_LLM_TRANSFORMATION,
  ingestFolder,
  ingestJobTag,
  MemoryIngestUploads,
} from './ingest-uploads';

const file = { bytes: new Uint8Array([1, 2, 3]), mime: 'image/png' };

describe('ingest upload naming', () => {
  it('tags by job and folders by deck', () => {
    expect(ingestJobTag('j1')).toBe('job:j1');
    expect(ingestFolder('d1')).toBe('gobbit/ingest/d1');
  });

  it('derives a bounded JPEG for the model (D101)', () => {
    expect(INGEST_LLM_TRANSFORMATION).toBe('f_jpg,w_1568,c_limit,q_auto');
  });
});

describe('MemoryIngestUploads', () => {
  it('stores uploads under the deck folder and deletes them per job', async () => {
    const store = new MemoryIngestUploads();
    const a = await store.upload('j1', 'd1', file);
    const b = await store.upload('j1', 'd1', file);
    const c = await store.upload('j2', 'd1', file);
    expect(a.publicId).toMatch(/^gobbit\/ingest\/d1\//);
    expect(new Set([a.publicId, b.publicId, c.publicId]).size).toBe(3);

    await store.deleteForJob('j1');
    expect(store.deletedJobs).toEqual(['j1']);
    expect([...store.uploads.keys()]).toEqual([c.publicId]);
  });

  it('builds a delivery URL with the LLM transformation', () => {
    const url = new MemoryIngestUploads('demo').llmUrl('gobbit/ingest/d1/upload-1');
    expect(url).toContain('/demo/');
    expect(url).toContain(INGEST_LLM_TRANSFORMATION);
    expect(url).toContain('gobbit/ingest/d1/upload-1');
  });
});
