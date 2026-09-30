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
      '/decks/{id}': ['get', 'patch', 'delete'],
      '/decks/{id}/categories': ['get', 'post'],
      '/decks/{id}/items': ['get', 'post'],
      '/decks/{id}/members': ['get'],
      '/decks/{id}/members/{userId}': ['delete'],
      '/decks/{id}/invites': ['post'],
      '/items/{id}': ['get', 'patch', 'delete'],
      '/items/{id}/archive': ['post'],
      '/items/{id}/favorite': ['post', 'delete'],
      '/auth/magic-link': ['post'],
      '/auth/callback': ['get'],
      '/auth/logout': ['post'],
      '/auth/logout-all': ['post'],
      '/auth/token-exchange': ['post'],
      '/me': ['get'],
    };

    for (const [path, methods] of Object.entries(expectedPaths)) {
      expect(paths[path]).toBeDefined();
      for (const method of methods) {
        expect(paths[path][method]).toBeDefined();
      }
    }

    // Check security schemes
    const securitySchemes = (doc.components as Record<string, Record<string, any>>).securitySchemes;

    expect(securitySchemes.SessionCookie).toEqual({
      type: 'apiKey',
      in: 'cookie',
      name: 'gobbit_session',
    });
    expect(securitySchemes.BearerToken).toEqual({ type: 'http', scheme: 'bearer' });
    expect(Object.keys(securitySchemes).sort()).toEqual(['BearerToken', 'SessionCookie']);

    // Authenticated routes accept either scheme; public auth routes declare none
    const decksGet = paths['/decks'].get as { security?: unknown };
    expect(decksGet.security).toEqual([{ SessionCookie: [] }, { BearerToken: [] }]);
    const magicLink = paths['/auth/magic-link'].post as { security?: unknown };
    expect(magicLink.security).toBeUndefined();
    expect((doc.info as { title: string }).title).toBe('Gobbit API');

    // Check for expected strings in stringified doc
    const docString = JSON.stringify(doc);
    expect(docString).toContain('Unicode code points');
    expect(docString).toContain('bytes (UTF-8)');
  });
});
