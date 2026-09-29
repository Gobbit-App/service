import { describe, it, expect } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import { setupApiTest } from './helpers';

describe('OpenAPI', () => {
  const ctx = setupApiTest();

  it('GET /openapi.json returns valid OpenAPI 3.1.0 spec', async () => {
    const res = await ctx.app.request('/openapi.json');
    expect(res.status).toBe(200);

    const doc = (await res.json()) as Record<string, unknown>;

    // Validate with SwaggerParser
    await SwaggerParser.validate(structuredClone(doc) as any);

    // Check OpenAPI version
    expect((doc.openapi as string).startsWith('3.1')).toBe(true);

    // Check paths with their methods
    const paths = doc.paths as Record<string, Record<string, unknown>>;
    const expectedPaths: Record<string, string[]> = {
      '/health': ['get'],
      '/decks': ['get', 'post'],
      '/decks/{id}': ['get', 'patch'],
      '/decks/{id}/categories': ['get', 'post'],
      '/decks/{id}/items': ['get', 'post'],
      '/items/{id}': ['get', 'patch', 'delete'],
      '/items/{id}/archive': ['post'],
      '/items/{id}/favorite': ['post', 'delete'],
    };

    for (const [path, methods] of Object.entries(expectedPaths)) {
      expect(paths[path]).toBeDefined();
      for (const method of methods) {
        expect(paths[path][method]).toBeDefined();
      }
    }

    // Check security schemes
    const securitySchemes = (doc.components as Record<string, Record<string, any>>).securitySchemes;

    expect(securitySchemes.DevToken).toBeDefined();
    expect(securitySchemes.DevToken.type).toBe('http');
    expect(securitySchemes.DevToken.scheme).toBe('bearer');

    expect(securitySchemes.DevUser).toBeDefined();
    expect(securitySchemes.DevUser.type).toBe('apiKey');
    expect(securitySchemes.DevUser.in).toBe('header');
    expect(securitySchemes.DevUser.name).toBe('X-Dev-User');

    // Check for expected strings in stringified doc
    const docString = JSON.stringify(doc);
    expect(docString).toContain('Unicode code points');
    expect(docString).toContain('bytes (UTF-8)');
  });
});
