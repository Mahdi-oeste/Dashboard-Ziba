/**
 * Logger estructurado JSON, una linea por entrada.
 *   log.info({ route }, 'GET /destinations/:id');
 */
import { config } from './config.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

function emit(level: Level, ctxOrMsg: unknown, maybeMsg?: string): void {
  if (LEVELS[level] < threshold) return;

  let ctx: Record<string, unknown> = {};
  let msg = '';
  if (typeof ctxOrMsg === 'string') {
    msg = ctxOrMsg;
  } else if (ctxOrMsg && typeof ctxOrMsg === 'object') {
    ctx = { ...(ctxOrMsg as Record<string, unknown>) };
    msg = maybeMsg ?? '';
  } else {
    msg = String(ctxOrMsg);
  }

  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    service: config.serviceName,
    msg,
    ...ctx,
  };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

export const log = {
  debug: (ctxOrMsg: unknown, msg?: string) => emit('debug', ctxOrMsg, msg),
  info:  (ctxOrMsg: unknown, msg?: string) => emit('info',  ctxOrMsg, msg),
  warn:  (ctxOrMsg: unknown, msg?: string) => emit('warn',  ctxOrMsg, msg),
  error: (ctxOrMsg: unknown, msg?: string) => emit('error', ctxOrMsg, msg),
};
