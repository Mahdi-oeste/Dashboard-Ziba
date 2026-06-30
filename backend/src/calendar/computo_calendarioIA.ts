/**
 * computo_calendarioIA.ts — Segundo motor de precios ("IA") del calendario.
 *
 * Portado desde Dashboard-Ziba/backend/computo_calendarioIA.js a ESM/TS.
 * Usa las columnas *_ia de las tablas de ponderacion y aplica un multiplicador
 * estocastico (0.9–1.1) sobre la formula base. NO llama a ningun servicio
 * externo (Ollama): la URL del modelo en el server.js original era codigo
 * muerto. Reutiliza el Pool compartido (db.ts) y escribe en calendario.ia_price.
 */
import { pool } from '../db.js';

const MAPA: Record<string, number> = {
  'muy bajo': 0.6, 'muy baja': 0.6,
  bajo: 0.8, baja: 0.8,
  medio: 1.0, media: 1.0,
  alto: 1.2, alta: 1.2,
  'muy alto': 1.4, 'muy alta': 1.4,
};
const etiquetaAMult = (e?: string | null): number =>
  MAPA[(e || 'medio').toLowerCase().trim()] ?? 1.0;

async function safeQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  try {
    const r = await pool.query(sql);
    return r.rows as T[];
  } catch (e) {
    console.warn(
      `[WARN] computo_calendarioIA — query fallo (${(e as Error).message.split('\n')[0]}). Usando valores por defecto.`
    );
    return [];
  }
}

/** Calcula y persiste ia_price para cada fecha del rango. */
export async function calcularPreciosIA(
  fechaInicio: string,
  fechaFin: string
): Promise<void> {
  console.log(`[INFO] computo_calendarioIA: calculando ${fechaInicio} → ${fechaFin}`);

  const [rDias, rMeses, rTablas, rEspeciales] = await Promise.all([
    safeQuery<{ id_day: number; pond_day_ia: string }>(
      'SELECT id_day, pond_day_ia FROM ponderacion_dias'
    ),
    safeQuery<{ id_month: number; pond_month_ia: string }>(
      'SELECT id_month, pond_month_ia FROM ponderacion_meses'
    ),
    safeQuery<{ id_table: number; pond_table_ia: string }>(
      'SELECT id_table, pond_table_ia FROM ponderacion_tablas ORDER BY id_table'
    ),
    safeQuery<{ fi: string; ff: string; pond_especial_ia: string }>(`
      SELECT TO_CHAR(fecha_inicio,'YYYY-MM-DD') AS fi,
             TO_CHAR(fecha_fin,   'YYYY-MM-DD') AS ff,
             pond_especial_ia
      FROM fechas_especiales ORDER BY fecha_inicio
    `),
  ]);

  const pondDias: Record<number, string> = {};
  rDias.forEach((r) => { pondDias[r.id_day] = r.pond_day_ia; });

  const pondMeses: Record<number, string> = {};
  rMeses.forEach((r) => { pondMeses[r.id_month] = r.pond_month_ia; });

  const pondTablas: Record<number, string> = {};
  rTablas.forEach((r) => { pondTablas[r.id_table] = r.pond_table_ia; });

  const infDias = etiquetaAMult(pondTablas[0] || 'Medio');
  const infMeses = etiquetaAMult(pondTablas[1] || 'Medio');
  const infEsp = etiquetaAMult(pondTablas[2] || 'Medio');

  const mapaEsp: Record<string, number> = {};
  rEspeciales.forEach((fe) => {
    const ini = new Date(fe.fi + 'T00:00:00');
    const fin = new Date(fe.ff + 'T00:00:00');
    for (let d = new Date(ini); d <= fin; d.setDate(d.getDate() + 1)) {
      mapaEsp[d.toISOString().split('T')[0]] = etiquetaAMult(fe.pond_especial_ia);
    }
  });

  const baseline = 400000;
  const FLOOR = 200000;
  const CEILING = 1000000;

  const rows: { fecha: string; precio: number }[] = [];
  const cur = new Date(fechaInicio + 'T00:00:00');
  const end = new Date(fechaFin + 'T00:00:00');

  while (cur <= end) {
    const fecha = cur.toISOString().split('T')[0];
    cur.setDate(cur.getDate() + 1);

    const dow = new Date(fecha + 'T00:00:00').getDay();
    const month = new Date(fecha + 'T00:00:00').getMonth() + 1;

    const wDia = 1 + (etiquetaAMult(pondDias[dow] || 'Medio') - 1) * infDias;
    const wMes = 1 + (etiquetaAMult(pondMeses[month] || 'Media') - 1) * infMeses;
    const wEsp = 1 + ((mapaEsp[fecha] || 1.0) - 1) * infEsp;

    const randomMultiplier = Math.random() * 0.2 + 0.9; // 0.9–1.1
    const rawPrice = baseline * wDia * wMes * wEsp * randomMultiplier;
    const precio = Math.round(Math.max(FLOOR, Math.min(CEILING, rawPrice)));

    rows.push({ fecha, precio });
  }

  // Upsert masivo: UNA sola sentencia con UNNEST en lugar de 1 INSERT por dia.
  const fechas = rows.map((r) => r.fecha);
  const precios = rows.map((r) => r.precio);
  try {
    await pool.query(
      `INSERT INTO calendario
         (start_date, id_day, id_month, id_year, ia_price, special_day)
       SELECT d::date,
              EXTRACT(DOW   FROM d)::int,
              EXTRACT(MONTH FROM d)::int,
              EXTRACT(YEAR  FROM d)::int,
              p, FALSE
       FROM UNNEST($1::date[], $2::numeric[]) AS t(d, p)
       ON CONFLICT (start_date)
       DO UPDATE SET ia_price = EXCLUDED.ia_price`,
      [fechas, precios]
    );
    console.log(`[OK] computo_calendarioIA: ${rows.length} fechas actualizadas en ia_price (upsert masivo).`);
  } catch (err) {
    console.error('[ERROR] computo_calendarioIA error al guardar:', (err as Error).message);
    throw err;
  }
}
