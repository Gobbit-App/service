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
