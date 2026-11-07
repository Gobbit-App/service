import { describe, expect, it } from 'vitest';
import { ExtractResponseError, responseError } from './extractor';

describe('responseError (D354)', () => {
  it.each([
    ['length', 'no_call', 'truncated'],
    ['max_tokens', 'bad_json', 'truncated'],
    ['refusal', 'no_call', 'refused'],
    ['content_filter', 'bad_json', 'refused'],
    ['stop', 'bad_json', 'bad_json'],
    [null, 'no_call', 'no_call'],
  ] as const)('stop %s with symptom %s is %s', (stop, symptom, kind) => {
    expect(responseError(symptom, stop, null).kind).toBe(kind);
  });

  it('names the stop reason in the message and keeps the usage', () => {
    const usage = { inputTokens: 3, outputTokens: 4 };
    const err = responseError('bad_json', 'length', usage);
    expect(err.message).toBe('propose_card call cut off by the output budget (stop: length)');
    expect(err.usage).toEqual(usage);
  });

  it('allows a corrective retry only for a missing call or broken JSON', () => {
    expect(new ExtractResponseError('no_call').retryable).toBe(true);
    expect(new ExtractResponseError('bad_json').retryable).toBe(true);
    expect(new ExtractResponseError('truncated').retryable).toBe(false);
    expect(new ExtractResponseError('refused').retryable).toBe(false);
  });

  it('keeps the old message without a stop reason', () => {
    expect(new ExtractResponseError('no_call').message).toBe(
      'Extraction returned no propose_card call',
    );
  });
});
