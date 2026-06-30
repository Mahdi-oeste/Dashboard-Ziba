/**
 * Entrypoint del api REST.
 *
 *  1. Build Fastify
 *  2. Ping a Postgres antes de empezar a escuchar
 *  3. Listen on HOST:PORT
 *  4. SIGINT/SIGTERM -> cierra Fastify y el pool de pg con timeout duro.
 *
 * El api NO escribe en service_state (eso es para workers). Su salud se
 * revisa por GET /healthz, que ademas reporta a todos los workers.
 */
import { buildServer } from './server.js';
import { config } from './config.js';
import { log } from './logger.js';
import { query, shutdown as dbShutdown } from './db.js';
import { initCalendar } from './routes/calendar.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  // Espera a Postgres con reintentos. Si sigue caido, arranca igual y deja que
  // GET /healthz reporte el estado (evita crash-loop del contenedor y permite
  // ver errores claros en vez de 502 en todo /api).
  const MAX_TRIES = 10;
  for (let i = 1; i <= MAX_TRIES; i++) {
    try {
      await query('SELECT 1');
      log.info({}, 'db ping ok');
      break;
    } catch (err) {
      log.warn({ try: i, err: (err as Error).message }, 'db no disponible, reintentando en 3s');
      if (i === MAX_TRIES) log.error({}, 'db sigue caida; arranco igual (revisa DATABASE_URL)');
      else await new Promise((r) => setTimeout(r, 3000));
    }
  }

  const app = await buildServer();

  try {
    await app.listen({ host: config.http.host, port: config.http.port });
    log.info(
      {
        host: config.http.host,
        port: config.http.port,
        corsOrigins: config.http.corsOrigins,
      },
      'api listening'
    );
    void initCalendar();
  } catch (err) {
    log.error({ err: (err as Error).message }, 'fastify listen failed');
    await dbShutdown().catch(() => {});
    process.exit(1);
  }

  let shuttingDown = false;
  async function gracefulShutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      log.warn({ signal }, 'second signal - forcing exit');
      process.exit(1);
    }
    shuttingDown = true;
    log.info({ signal }, 'shutting down');

    const timeout = setTimeout(() => {
      log.error({}, 'shutdown timeout - forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      await app.close();
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'fastify close failed');
    }
    try {
      await dbShutdown();
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'db shutdown failed');
    }
    clearTimeout(timeout);
    log.info({}, 'bye');
    process.exit(0);
  }

  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
}

main().catch((err) => {
  log.error({ err: (err as Error).message, stack: (err as Error).stack }, 'fatal');
  process.exit(1);
});
