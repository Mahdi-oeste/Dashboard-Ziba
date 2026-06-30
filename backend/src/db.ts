/**
 * Pool de Postgres compartido + utilidades de consulta.
 *
 * - BIGINT (OID 20) y NUMERIC (OID 1700) se devuelven como number.
 * - search_path se inyecta via options del Pool.
 */
import pg from 'pg';
import { config } from './config.js';

pg.types.setTypeParser(20, (val: string | null) => (val === null ? null : Number(val)));
pg.types.setTypeParser(1700, (val: string | null) => (val === null ? null : Number(val)));

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  options: `-c search_path=${config.schema},public`,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[db] unexpected error on idle client', err);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never[]);
}

export async function shutdown(): Promise<void> {
  await pool.end();
}
