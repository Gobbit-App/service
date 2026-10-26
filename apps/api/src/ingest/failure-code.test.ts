import { describe, expect, it } from 'vitest';
import { classifyFailure, failureDetail } from './failure-code';

describe('classifyFailure', () => {
  it.each([
    ['raw_missing', 'content_expired'],
    ['sharer_gone', 'sharer_left'],
    ['sharer_not_member', 'sharer_left'],
    ['invalid_output: title is required', 'unreadable_answer'],
    ['stalled', 'unknown'],
  ] as const)('maps the stored code %s to %s', (input, code) => {
    expect(classifyFailure(input)).toBe(code);
  });

  it('maps a provider error during extraction to assistant_unavailable', () => {
    expect(classifyFailure(new Error('401 No auth credentials found'), 'extract')).toBe(
      'assistant_unavailable',
    );
  });

  it('maps a timeout during extraction to assistant_unavailable', () => {
    const err = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    expect(classifyFailure(err, 'extract')).toBe('assistant_unavailable');
  });

  it('maps a provider that could not read the photo to image_unavailable', () => {
    expect(classifyFailure(new Error('400 Failed to download image from the URL'), 'extract')).toBe(
      'image_unavailable',
    );
  });

  it('maps an error while reading the shared page to fetch_failed', () => {
    expect(classifyFailure(new Error('socket hang up'), 'normalize')).toBe('fetch_failed');
  });

  it('maps an error without a stage to unknown', () => {
    expect(classifyFailure(new Error('boom'))).toBe('unknown');
    expect(classifyFailure(42)).toBe('unknown');
  });
});

describe('failureDetail', () => {
  it('returns the issues of an invalid answer, capped', () => {
    expect(failureDetail('invalid_output: title: Invalid input')).toBe('title: Invalid input');
    expect(failureDetail(`invalid_output: ${'x'.repeat(400)}`)).toHaveLength(300);
  });

  it('has no detail for errors that may quote shared content', () => {
    expect(failureDetail('error: provider 502 while fetching https://a.example')).toBeUndefined();
    expect(failureDetail('raw_missing')).toBeUndefined();
  });
});
