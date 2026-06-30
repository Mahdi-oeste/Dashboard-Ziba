import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { log } from './logger.js';
import { ApiError } from './validation.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerCalendarRoutes } from './routes/calendar.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, disableRequestLogging: true });

  const origins = config.http.corsOrigins;
  await app.register(cors, {
    origin: origins.includes('*') ? true : origins,
    methods: ['GET', 'POST', 'OPTIONS', 'PATCH', 'PUT', 'DELETE'],
    credentials: false,
  });

  app.addHook('onRequest', async (req) => {
    (req as unknown as { _started: number })._started = Date.now();
  });
  app.addHook('onResponse', async (req, reply) => {
    const started = (req as unknown as { _started?: number })._started ?? Date.now();
    log.info(
      { method: req.method, url: req.url, statusCode: reply.statusCode, elapsedMs: Date.now() - started },
      'request'
    );
  });

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof ApiError) {
      reply.code(err.statusCode).send({ error: err.message, details: err.details ?? null });
      return;
    }
    const e = err as Error;
    log.error({ error: e?.message ?? String(err), stack: e?.stack }, 'unhandled error');
    reply.code(500).send({ error: 'internal server error' });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ error: `not found: ${req.method} ${req.url}` });
  });

  registerHealthRoutes(app);
  registerCalendarRoutes(app);

  app.get('/', async () => ({ service: 'ziba-calendar-api', version: '0.1.0' }));

  return app;
}
