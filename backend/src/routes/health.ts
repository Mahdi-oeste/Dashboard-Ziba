import type { FastifyInstance } from 'fastify';
import { query } from '../db.js';

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/healthz', async (_req, reply) => {
    try {
      await query('SELECT 1');
      return { status: 'ok', db: { ok: true } };
    } catch (err) {
      reply.code(503);
      return { status: 'down', db: { ok: false, error: (err as Error).message } };
    }
  });
}
