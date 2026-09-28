import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  badRequest,
  unauthorized,
  notFound,
  conflict,
  unprocessable,
  problemFromZodError,
  problemResponse,
} from './http-errors';

describe('http-errors', () => {
  describe('notFound', () => {
    it('should return correct problem object', () => {
      const err = notFound('x');
      const problem = err.toProblem();

      expect(problem).toEqual({
        type: '/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail: 'x',
      });
    });
  });

  describe('badRequest', () => {
    it('should include errors when provided', () => {
      const errors = [{ path: 'field1', message: 'Required' }];
      const err = badRequest('Bad data', errors);
      const problem = err.toProblem();

      expect(problem.status).toBe(400);
      expect(problem.type).toBe('/problems/bad-request');
      expect(problem.title).toBe('Bad Request');
      expect(problem.detail).toBe('Bad data');
      expect(problem.errors).toEqual(errors);
    });

    it('should work without errors', () => {
      const err = badRequest('Bad data');
      const problem = err.toProblem();

      expect(problem.status).toBe(400);
      expect(problem.errors).toBeUndefined();
    });
  });

  describe('conflict', () => {
    it('should use default type', () => {
      const err = conflict('Already exists');
      const problem = err.toProblem();

      expect(problem.status).toBe(409);
      expect(problem.type).toBe('/problems/conflict');
      expect(problem.title).toBe('Conflict');
      expect(problem.detail).toBe('Already exists');
    });

    it('should use custom type when provided', () => {
      const err = conflict('Already exists', '/problems/custom-conflict');
      const problem = err.toProblem();

      expect(problem.type).toBe('/problems/custom-conflict');
    });
  });

  describe('unprocessable', () => {
    it('should use default type', () => {
      const err = unprocessable('Cannot process');
      const problem = err.toProblem();

      expect(problem.status).toBe(422);
      expect(problem.type).toBe('/problems/unprocessable');
      expect(problem.title).toBe('Unprocessable Content');
    });

    it('should use custom type when provided', () => {
      const err = unprocessable('Cannot process', '/problems/custom-unprocessable');
      const problem = err.toProblem();

      expect(problem.type).toBe('/problems/custom-unprocessable');
    });
  });

  describe('unauthorized', () => {
    it('should return correct problem object', () => {
      const err = unauthorized('Not authorized');
      const problem = err.toProblem();

      expect(problem).toEqual({
        type: '/problems/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Not authorized',
      });
    });
  });

  describe('problemFromZodError', () => {
    it('should handle nested validation error with correct path', () => {
      const schema = z.object({ a: z.object({ b: z.string() }) });
      const result = schema.safeParse({ a: { b: 1 } });

      expect(result.success).toBe(false);
      const problem = problemFromZodError(result.error!);

      expect(problem.status).toBe(400);
      expect(problem.type).toBe('/problems/validation');
      expect(problem.title).toBe('Validation failed');
      expect(problem.errors).toBeDefined();
      expect(problem.errors![0].path).toBe('a.b');
    });

    it('should handle multiple errors', () => {
      const schema = z.object({
        field1: z.string(),
        field2: z.number(),
      });
      const result = schema.safeParse({ field1: 123, field2: 'text' });

      expect(result.success).toBe(false);
      const problem = problemFromZodError(result.error!);

      expect(problem.errors).toBeDefined();
      expect(problem.errors!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('problemResponse', () => {
    it('should return correct status and content-type', async () => {
      const app = new Hono();
      const testProblem = {
        type: '/problems/test',
        title: 'Test',
        status: 400,
        detail: 'Test detail',
      };

      app.get('/', (c) => problemResponse(c, testProblem));

      const response = await app.request('/');

      expect(response.status).toBe(400);
      expect(response.headers.get('Content-Type')).toBe('application/problem+json');

      const body = await response.json();
      expect(body).toEqual(testProblem);
    });

    it('should include errors when present', async () => {
      const app = new Hono();
      const testProblem = {
        type: '/problems/validation',
        title: 'Validation failed',
        status: 400,
        detail: 'Invalid input',
        errors: [{ path: 'field', message: 'Required' }],
      };

      app.get('/', (c) => problemResponse(c, testProblem));

      const response = await app.request('/');

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.errors).toEqual(testProblem.errors);
    });

    it('should work with 404 status', async () => {
      const app = new Hono();
      const testProblem = {
        type: '/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail: 'Resource not found',
      };

      app.get('/', (c) => problemResponse(c, testProblem));

      const response = await app.request('/');

      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Type')).toBe('application/problem+json');
    });
  });
});
