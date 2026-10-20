import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/api-error';
import { GENERIC_SAVE_ERROR } from '../api/problem-messages';
import {
  FORBIDDEN_SAVE,
  NOT_FOUND_SAVE,
  OFFLINE_SAVE,
  fieldPath,
  problemToErrors,
} from './problem-fields';

const problem = (status: number, body: Record<string, unknown>) => new ApiError(status, body);

describe('fieldPath', () => {
  it('keeps top-level paths and prefixes payload-relative ones', () => {
    expect(fieldPath('title')).toBe('title');
    expect(fieldPath('payload.rows.3.1')).toBe('payload.rows.3.1');
    expect(fieldPath('columns.1')).toBe('payload.columns.1');
    expect(fieldPath('')).toBeNull();
  });
});

describe('problemToErrors', () => {
  it('puts validation errors on their fields', () => {
    const err = problem(400, {
      type: '/problems/validation',
      errors: [
        { path: 'title', message: 'Too long' },
        { path: 'payload.rows.3.1', message: 'Bad cell' },
      ],
    });
    expect(problemToErrors(err)).toEqual({
      fields: { title: 'Too long', 'payload.rows.3.1': 'Bad cell' },
      form: null,
    });
  });

  it('maps a PATCH payload path (no prefix) under payload', () => {
    const err = problem(400, {
      type: '/problems/validation',
      errors: [{ path: 'expression', message: 'Unknown symbol c' }],
    });
    expect(problemToErrors(err).fields).toEqual({ 'payload.expression': 'Unknown symbol c' });
  });

  it('puts a bad-request categoryIds error on the categories', () => {
    const err = problem(400, {
      type: '/problems/bad-request',
      detail: 'Unknown category',
      errors: [{ path: 'categoryIds', message: 'Unknown category id' }],
    });
    expect(problemToErrors(err)).toEqual({
      fields: { categoryIds: 'Unknown category id' },
      form: null,
    });
  });

  it('keeps messages without a path at form level', () => {
    const err = problem(400, {
      type: '/problems/validation',
      errors: [
        { path: '', message: 'At least one field is required' },
        { path: 'body', message: 'Too long' },
      ],
    });
    expect(problemToErrors(err)).toEqual({
      fields: { body: 'Too long' },
      form: 'At least one field is required',
    });
  });

  it('maps 422 item-needs-category to the categories', () => {
    const err = problem(422, { type: '/problems/item-needs-category', detail: 'x' });
    expect(problemToErrors(err)).toEqual({
      fields: { categoryIds: 'Pick at least one category' },
      form: null,
    });
  });

  it('shows a 409 conflict at form level', () => {
    const err = problem(409, { type: '/problems/conflict', detail: 'Already exists' });
    expect(problemToErrors(err)).toEqual({ fields: {}, form: 'Already exists' });
  });

  it('shows constraint-violation and payload-too-large at form level', () => {
    expect(
      problemToErrors(problem(422, { type: '/problems/constraint-violation', detail: 'Too big' })),
    ).toEqual({ fields: {}, form: 'Too big' });
    expect(
      problemToErrors(
        problem(413, { type: '/problems/payload-too-large', title: 'Payload Too Large' }),
      ),
    ).toEqual({ fields: {}, form: 'Payload Too Large' });
  });

  it('maps 403 and 404 to fixed copy', () => {
    expect(problemToErrors(problem(403, { type: '/problems/forbidden' })).form).toBe(
      FORBIDDEN_SAVE,
    );
    expect(problemToErrors(problem(404, { type: '/problems/not-found' })).form).toBe(
      NOT_FOUND_SAVE,
    );
  });

  it('treats a network failure as offline', () => {
    expect(problemToErrors(new TypeError('Failed to fetch'))).toEqual({
      fields: {},
      form: OFFLINE_SAVE,
    });
  });

  it('falls back to the generic line for a bare error status', () => {
    expect(problemToErrors(new ApiError(500, null)).form).toBe(GENERIC_SAVE_ERROR);
  });
});
