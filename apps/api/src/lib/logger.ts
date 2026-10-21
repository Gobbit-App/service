import { pino, type DestinationStream, type Level, type Logger } from 'pino';

export type { Logger };

const LEVELS = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

/** LOG_LEVEL wins; tests are silent unless asked; everything else logs info and up. */
export function resolveLogLevel(env: NodeJS.ProcessEnv = process.env): string {
  const requested = env.LOG_LEVEL?.trim().toLowerCase();
  if (requested && LEVELS.has(requested)) return requested;
  return env.VITEST ? 'silent' : 'info';
}

/**
 * One JSON object per line on stdout: ISO `time`, textual `level`, `component`, `msg`, and any
 * structured fields; errors go under `err` (type, message, stack, code via pino's serializer).
 */
export function createLogger(
  options: { level?: string; destination?: DestinationStream } = {},
): Logger {
  return pino(
    {
      level: options.level ?? resolveLogLevel(),
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
    },
    options.destination,
  );
}

/** Process-wide root logger; modules take a `childLogger(component)`. */
export const logger = createLogger();

export function childLogger(component: string, parent: Logger = logger): Logger {
  return parent.child({ component });
}

/** `createPool({ onIdleError })` handler for the API and worker. */
export function logDbIdleError(err: Error): void {
  childLogger('db').error({ err }, 'idle client error');
}

/** `[tag] message` → `message`: the component field already says where the line came from. */
const TAG_PREFIX = /^\[[^\]]+\]\s*/;

/**
 * Adapter for the injectable `log(message)` sinks services use (kept so tests can capture
 * lines): writes each message as a JSON line at `level`, with an optional error under `err`.
 */
export function lineSink(
  component: string,
  level: Level = 'error',
  parent: Logger = logger,
): (message: string, err?: unknown) => void {
  const log = childLogger(component, parent);
  return (message, err) => {
    const msg = message.replace(TAG_PREFIX, '');
    if (err === undefined) log[level](msg);
    else log[level]({ err }, msg);
  };
}
