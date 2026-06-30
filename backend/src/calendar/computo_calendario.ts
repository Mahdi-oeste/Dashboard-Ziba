/**
 * computo_calendario.ts — Motor estadistico de precios del calendario.
 *
 * Portado desde Dashboard-Ziba/backend/computo_calendario.js (CommonJS) a
 * ESM/TypeScript para vivir dentro de la API Fastify consolidada. Reutiliza
 * el Pool de Postgres compartido (db.ts), por lo que respeta DATABASE_URL y
 * el search_path configurado a nivel de Pool.
 *
 * Lee de: ponderacion_dias, ponderacion_meses, ponderacion_tablas,
 *         fechas_especiales, reservations, configuracion_pesos_reglas.
 * Escribe en: calendario.computed_price.
 */
import { pool } from '../db.js';

/* CONVERSION CUALITATIVA -> MULTIPLICADOR */
const MAPA: Record<string, number> = {
  'muy bajo': 0.6, 'muy baja': 0.6,
  bajo: 0.8, baja: 0.8,
  medio: 1.0, media: 1.0,
  alto: 1.2, alta: 1.2,
  'muy alto': 1.4, 'muy alta': 1.4,
};
const etiquetaAMult = (e?: string | null): number =>
  MAPA[(e || 'medio').toLowerCase().trim()] ?? 1.0;

/** Ejecuta una query y devuelve sus filas, o [] si la tabla no existe. */
async function safeQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  try {
    const r = await pool.query(sql);
    return r.rows as T[];
  } catch (e) {
    console.warn(
      `[WARN] computo_calendario — query fallo (${(e as Error).message.split('\n')[0]}). Usando valores por defecto.`
    );
    return [];
  }
}

/**
 * Calcula y persiste el precio estadistico (computed_price) para cada fecha
 * del rango [fechaInicio, fechaFin] (formato "YYYY-MM-DD").
 */
export async function calcularPreciosEstadisticos(
  fechaInicio: string,
  fechaFin: string
): Promise<void> {
  console.log(`[INFO] computo_calendario: calculando ${fechaInicio} → ${fechaFin}`);

  const [rDias, rMeses, rTablas, rEspeciales, rReservas] = await Promise.all([
    safeQuery<{ id_day: number; pond_day_user: string }>(
      'SELECT id_day, pond_day_user FROM ponderacion_dias'
    ),
    safeQuery<{ id_month: number; pond_month_user: string }>(
      'SELECT id_month, pond_month_user FROM ponderacion_meses'
    ),
    safeQuery<{ id_table: number; pond_table_user: string }>(
      'SELECT id_table, pond_table_user FROM ponderacion_tablas ORDER BY id_table'
    ),
    safeQuery<{ fi: string; ff: string; pond_especial_user: string }>(`
      SELECT TO_CHAR(fecha_inicio,'YYYY-MM-DD') AS fi,
             TO_CHAR(fecha_fin,   'YYYY-MM-DD') AS ff,
             pond_especial_user
      FROM fechas_especiales ORDER BY fecha_inicio
    `),
    safeQuery<{ fecha: string; price: string | number }>(`
      SELECT TO_CHAR(date_start,'YYYY-MM-DD') AS fecha, price
      FROM reservations WHERE status = 'confirmado'
    `),
  ]);

  // Indices
  const pondDias: Record<number, string> = {};
  rDias.forEach((r) => { pondDias[r.id_day] = r.pond_day_user; });

  const pondMeses: Record<number, string> = {};
  rMeses.forEach((r) => { pondMeses[r.id_month] = r.pond_month_user; });

  // id_table: 0=dias, 1=meses, 2=fechas_especiales, 3=reservaciones
  const pondTablas: Record<number, string> = {};
  rTablas.forEach((r) => { pondTablas[r.id_table] = r.pond_table_user; });

  const infDias = etiquetaAMult(pondTablas[0] || 'Medio');
  const infMeses = etiquetaAMult(pondTablas[1] || 'Medio');
  const infEsp = etiquetaAMult(pondTablas[2] || 'Medio');

  const mapaEsp: Record<string, number> = {};
  rEspeciales.forEach((fe) => {
    const ini = new Date(fe.fi + 'T00:00:00');
    const fin = new Date(fe.ff + 'T00:00:00');
    for (let d = new Date(ini); d <= fin; d.setDate(d.getDate() + 1)) {
      mapaEsp[d.toISOString().split('T')[0]] = etiquetaAMult(fe.pond_especial_user);
    }
  });

  const reservadas: Record<string, number> = {};
  rReservas.forEach((r) => { reservadas[r.fecha] = Number(r.price); });

  const baseline = 400000;
  const FLOOR = 200000;
  const CEILING = 1000000;

  const rows: { fecha: string; precio: number }[] = [];
  const cur = new Date(fechaInicio + 'T00:00:00');
  const end = new Date(fechaFin + 'T00:00:00');

  while (cur <= end) {
    const fecha = cur.toISOString().split('T')[0];
    cur.setDate(cur.getDate() + 1);

    let precio: number;
    if (reservadas[fecha] !== undefined) {
      precio = reservadas[fecha];
    } else {
      const dow = new Date(fecha + 'T00:00:00').getDay();
      const month = new Date(fecha + 'T00:00:00').getMonth() + 1;

      const wDia = 1 + (etiquetaAMult(pondDias[dow] || 'Medio') - 1) * infDias;
      const wMes = 1 + (etiquetaAMult(pondMeses[month] || 'Media') - 1) * infMeses;
      const wEsp = 1 + ((mapaEsp[fecha] || 1.0) - 1) * infEsp;

      precio = Math.round(Math.max(FLOOR, Math.min(CEILING, baseline * wDia * wMes * wEsp)));
    }
    rows.push({ fecha, precio });
  }

  // Garantizar columna computed_price
  try {
    await pool.query(
      'ALTER TABLE calendario ADD COLUMN IF NOT EXISTS computed_price NUMERIC DEFAULT 400000'
    );
  } catch (e) {
    console.warn('[WARN] No se pudo agregar columna computed_price:', (e as Error).message);
  }

  // Upsert masivo: UNA sola sentencia con UNNEST en lugar de 1 INSERT por dia.
  // EXTRACT(DOW) en Postgres = 0..6 (Domingo..Sabado), igual que Date.getDay().
  const fechas = rows.map((r) => r.fecha);
  const precios = rows.map((r) => r.precio);
  try {
    await pool.query(
      `INSERT INTO calendario
         (start_date, id_day, id_month, id_year, ia_price, computed_price, special_day)
       SELECT d::date,
              EXTRACT(DOW   FROM d)::int,
              EXTRACT(MONTH FROM d)::int,
              EXTRACT(YEAR  FROM d)::int,
              p, p, FALSE
       FROM UNNEST($1::date[], $2::numeric[]) AS t(d, p)
       ON CONFLICT (start_date)
       DO UPDATE SET computed_price = EXCLUDED.computed_price`,
      [fechas, precios]
    );
    console.log(`[OK] computo_calendario: ${rows.length} fechas actualizadas en computed_price (upsert masivo).`);
  } catch (err) {
    console.error('[ERROR] computo_calendario error al guardar:', (err as Error).message);
    throw err;
  }
}
