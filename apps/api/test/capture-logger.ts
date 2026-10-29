import { Writable } from 'node:stream';
import { createLogger, type Logger } from '../src/lib/logger';

/** A real pino logger whose JSON lines are parsed into `lines` (call `flush()` before asserting). */
export function captureLogger(): {
  lines: Record<string, unknown>[];
  logger: Logger;
  flush: () => Promise<void>;
} {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _enc, done) {
      for (const line of chunk.toString().split('\n').filter(Boolean)) {
        lines.push(JSON.parse(line) as Record<string, unknown>);
      }
      done();
    },
  });
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
  return { lines, logger: createLogger({ level: 'trace', destination }), flush };
}

/**
 * D239: asserts that one captured line is the decision `event` with this outcome (and reason,
 * when given), and returns the latest match so the caller can check its other fields.
 */
export function expectDecision(
  lines: Record<string, unknown>[],
  event: string,
  expected: { outcome: string; reason?: string },
): Record<string, unknown> {
  const matches = lines.filter(
    (l) =>
      l.event === event &&
      l.outcome === expected.outcome &&
      (expected.reason === undefined || l.reason === expected.reason),
  );
  if (matches.length === 0) {
    const seen = lines
      .filter((l) => typeof l.event === 'string')
      .map((l) => `${String(l.event)}:${String(l.outcome)}:${String(l.reason ?? '')}`);
    throw new Error(
      `expected decision ${event} ${expected.outcome}/${expected.reason ?? '-'}; saw [${seen.join(', ')}]`,
    );
  }
  return matches[matches.length - 1];
}
