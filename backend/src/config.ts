/**
 * Configuracion del api REST cargada desde variables de entorno.
 */
import 'dotenv/config';

function int(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function bool(v: string | undefined, def = false): boolean {
  if (v == null) return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}
function csv(v: string | undefined, def: string[]): string[] {
  if (!v) return def;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

export const config = {
  databaseUrl: process.env.DATABASE_URL || 'postgresql://ziba:ziba@localhost:5432/ziba_db',
  schema: process.env.DB_SCHEMA || 'public',

  http: {
    host: process.env.HOST || '0.0.0.0',
    port: int(process.env.PORT, 3001),
    corsOrigins: csv(process.env.CORS_ORIGINS, ['http://localhost:5173', 'http://localhost:3000']),
  },

  defaults: {
    timeseriesDays: int(process.env.DEFAULT_TIMESERIES_DAYS, 30),
    commentsLimit: int(process.env.DEFAULT_COMMENTS_LIMIT, 50),
    maxCommentsLimit: int(process.env.MAX_COMMENTS_LIMIT, 200),
    eventsLimit: int(process.env.DEFAULT_EVENTS_LIMIT, 50),
    maxEventsLimit: int(process.env.MAX_EVENTS_LIMIT, 200),
    allowEmptyDestinations: bool(process.env.ALLOW_EMPTY_DESTINATIONS, true),
  },

  serviceName: process.env.SERVICE_NAME || 'api',
  logLevel: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
} as const;
