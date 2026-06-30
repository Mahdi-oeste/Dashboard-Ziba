/**
 * calendar.ts — Endpoints del Calendario de reservaciones (Zibá), portados
 * desde el server.js (Express) de Dashboard-Ziba a un plugin Fastify dentro
 * de la API consolidada. Todas las rutas viven bajo /api en produccion (el
 * nginx del frontend reescribe /api/ -> api:3001/).
 *
 *   GET    /estrategia?fecha_inicio&fecha_fin
 *   GET    /ponderacion-dias            PUT /actualizar-ponderacion-dia
 *   GET    /ponderacion-meses           PUT /actualizar-ponderacion-mes
 *   GET/POST/PUT/DELETE /periodos-especiales[/:id]
 *   GET/PUT /pesos-usuario
 *   GET/POST /reservaciones             GET/PUT/DELETE /reservaciones/:id
 *   GET    /eventos                     (SSE: recalculo del calendario)
 *
 * Reutiliza el Pool compartido (db.ts -> DATABASE_URL). Tras cada escritura
 * se dispara un recalculo en segundo plano (ambos motores) y se notifica a
 * los clientes SSE conectados.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ServerResponse } from 'node:http';
import { pool, query } from '../db.js';
import { calcularPreciosEstadisticos } from '../calendar/computo_calendario.js';
import { calcularPreciosIA } from '../calendar/computo_calendarioIA.js';

// Rango fijo de recalculo, heredado del server.js original.
const RANGO_INICIO = '2025-01-01';
const RANGO_FIN = '2027-12-31';

/* ---- SSE: clientes conectados + recalculo orquestado --------------------- */
const clientesSSE = new Set<ServerResponse>();
let recalculoPendiente = false;

function notificarClientes(): void {
  const mensaje = `event: calendario_actualizado\ndata: ${Date.now()}\n\n`;
  for (const res of clientesSSE) {
    try {
      res.write(mensaje);
    } catch {
      clientesSSE.delete(res);
    }
  }
}

async function recalcularYGuardarCalendario(): Promise<void> {
  if (recalculoPendiente) return;
  recalculoPendiente = true;
  try {
    // Motor estadistico (computed_price) + motor IA (ia_price) en paralelo.
    await Promise.all([
      calcularPreciosEstadisticos(RANGO_INICIO, RANGO_FIN),
      calcularPreciosIA(RANGO_INICIO, RANGO_FIN),
    ]);
    notificarClientes();
  } catch (err) {
    console.error('[WARN] Error en recalcularYGuardarCalendario:', (err as Error).message);
  } finally {
    recalculoPendiente = false;
  }
}

function dispararRecalculo(): void {
  recalcularYGuardarCalendario().catch((e) =>
    console.error('[WARN] Recalculo error:', (e as Error).message)
  );
}

/**
 * Inicializacion del modulo calendario: garantiza columnas/normalizaciones y
 * lanza el primer recalculo. Llamar una sola vez al arrancar el servidor.
 */
export async function initCalendar(): Promise<void> {
  try {
    await query(
      'ALTER TABLE calendario ADD COLUMN IF NOT EXISTS computed_price NUMERIC DEFAULT 400000'
    );
    await query('ALTER TABLE reservations ADD COLUMN IF NOT EXISTS pre_start_date DATE');
    await query('ALTER TABLE reservations ADD COLUMN IF NOT EXISTS pre_price NUMERIC');
    await query('ALTER TABLE reservations ADD COLUMN IF NOT EXISTS post_end_date DATE');
    await query('ALTER TABLE reservations ADD COLUMN IF NOT EXISTS post_price NUMERIC');
    await query(`
      UPDATE ponderacion_dias SET
        pond_day_user = CASE LOWER(pond_day_user)
          WHEN 'muy alto' THEN 'Muy alto' WHEN 'muy alta' THEN 'Muy alto'
          WHEN 'alto'     THEN 'Alto'     WHEN 'alta'     THEN 'Alto'
          WHEN 'medio'    THEN 'Medio'    WHEN 'media'    THEN 'Medio'
          WHEN 'bajo'     THEN 'Bajo'     WHEN 'baja'     THEN 'Bajo'
          WHEN 'muy bajo' THEN 'Muy bajo' WHEN 'muy baja' THEN 'Muy bajo'
          ELSE 'Medio'
        END,
        pond_day_ia = CASE LOWER(pond_day_ia)
          WHEN 'muy alto' THEN 'Muy alto' WHEN 'muy alta' THEN 'Muy alto'
          WHEN 'alto'     THEN 'Alto'     WHEN 'alta'     THEN 'Alto'
          WHEN 'medio'    THEN 'Medio'    WHEN 'media'    THEN 'Medio'
          WHEN 'bajo'     THEN 'Bajo'     WHEN 'baja'     THEN 'Bajo'
          WHEN 'muy bajo' THEN 'Muy bajo' WHEN 'muy baja' THEN 'Muy bajo'
          ELSE 'Medio'
        END
    `);
    console.log('[OK] Calendario: BD verificada. Calculando calendario inicial...');
    dispararRecalculo();
  } catch (err) {
    console.error('[WARN] Calendario: error en inicializacion:', (err as Error).message);
  }
}

export function registerCalendarRoutes(app: FastifyInstance): void {
  /* ---- SSE -------------------------------------------------------------- */
  app.get('/eventos', (req, reply: FastifyReply) => {
    reply.hijack(); // Fastify deja de gestionar la respuesta; escribimos crudo.
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        /* socket cerrado */
      }
    }, 25000);

    clientesSSE.add(res);
    console.log(`[SSE] Cliente SSE conectado. Total: ${clientesSSE.size}`);

    req.raw.on('close', () => {
      clearInterval(ping);
      clientesSSE.delete(res);
      console.log(`[SSE] Cliente SSE desconectado. Total: ${clientesSSE.size}`);
    });
  });

  /* ---- 1. ESTRATEGIA DEL PERIODO --------------------------------------- */
  app.get('/estrategia', async (req, reply) => {
    const { fecha_inicio, fecha_fin } = req.query as {
      fecha_inicio?: string;
      fecha_fin?: string;
    };
    if (!fecha_inicio || !fecha_fin)
      return reply.code(400).send({ error: 'Faltan fecha_inicio y fecha_fin' });

    const [dbCal, dbDias, dbMeses, dbRes] = await Promise.all([
      query(
        `SELECT TO_CHAR(start_date,'YYYY-MM-DD') AS fecha, ia_price, computed_price
         FROM calendario WHERE start_date BETWEEN $1 AND $2 ORDER BY start_date`,
        [fecha_inicio, fecha_fin]
      ),
      query('SELECT id_day, pond_day_user, pond_day_ia FROM ponderacion_dias'),
      query('SELECT id_month, pond_month_user, pond_month_ia FROM ponderacion_meses'),
      query(
        `SELECT id_reservation,
                TO_CHAR(date_start,'YYYY-MM-DD')    AS fecha,
                price                                AS precio_final,
                client                               AS nombre_cliente,
                TO_CHAR(pre_start_date,'YYYY-MM-DD') AS pre_start_date,
                TO_CHAR(post_end_date,'YYYY-MM-DD')  AS post_end_date,
                pre_price,
                post_price
         FROM reservations WHERE status='confirmado'
         AND COALESCE(pre_start_date, date_start) <= $2::date
         AND COALESCE(post_end_date, date_start) >= $1::date`,
        [fecha_inicio, fecha_fin]
      ),
    ]);

    const reservadas: Record<string, unknown> = {};
    const periEventoFechas: Record<string, unknown> = {};
    dbRes.rows.forEach((r) => {
      const row = r as {
        fecha: string;
        precio_final: number;
        nombre_cliente: string;
        id_reservation: number;
        pre_start_date: string | null;
        post_end_date: string | null;
        pre_price: number | null;
        post_price: number | null;
      };
      reservadas[row.fecha] = row;

      if (row.pre_start_date && row.pre_start_date < row.fecha) {
        const cur = new Date(row.pre_start_date + 'T00:00:00');
        const end = new Date(row.fecha + 'T00:00:00');
        end.setDate(end.getDate() - 1);
        while (cur <= end) {
          periEventoFechas[cur.toISOString().split('T')[0]] = row;
          cur.setDate(cur.getDate() + 1);
        }
      }

      if (row.post_end_date && row.post_end_date > row.fecha) {
        const cur = new Date(row.fecha + 'T00:00:00');
        cur.setDate(cur.getDate() + 1);
        const end = new Date(row.post_end_date + 'T00:00:00');
        while (cur <= end) {
          periEventoFechas[cur.toISOString().split('T')[0]] = row;
          cur.setDate(cur.getDate() + 1);
        }
      }
    });

    const preciosSugeridos: Record<string, number> = {};
    const preciosComputados: Record<string, number> = {};
    dbCal.rows.forEach((r) => {
      const row = r as { fecha: string; ia_price: number; computed_price: number };
      preciosSugeridos[row.fecha] = Number(row.ia_price || 400000);
      preciosComputados[row.fecha] = Number(row.computed_price || row.ia_price || 400000);
    });

    const pondDiasUser: Record<number, string> = {};
    const pondDiasIA: Record<number, string> = {};
    dbDias.rows.forEach((r) => {
      const row = r as { id_day: number; pond_day_user: string; pond_day_ia: string };
      pondDiasUser[row.id_day] = row.pond_day_user;
      pondDiasIA[row.id_day] = row.pond_day_ia;
    });

    const pondMesesUser: Record<number, string> = {};
    const pondMesesIA: Record<number, string> = {};
    dbMeses.rows.forEach((r) => {
      const row = r as { id_month: number; pond_month_user: string; pond_month_ia: string };
      pondMesesUser[row.id_month - 1] = row.pond_month_user;
      pondMesesIA[row.id_month - 1] = row.pond_month_ia;
    });

    const mesId = new Date(fecha_inicio + 'T00:00:00').getMonth() + 1;
    const mesFila =
      (dbMeses.rows.find((m) => (m as { id_month: number }).id_month === mesId) as
        | { pond_month_user?: string; pond_month_ia?: string }
        | undefined) || {};

    return reply.send({
      precios_sugeridos_calendario: preciosSugeridos,
      precios_computados_calendario: preciosComputados,
      reservaciones_periodo: reservadas,
      fechas_peri_evento: periEventoFechas,
      ponderacion_dias_user: pondDiasUser,
      ponderacion_dias_ia: pondDiasIA,
      estacionalidad_meses_completo_user: pondMesesUser,
      estacionalidad_meses_completo_ia: pondMesesIA,
      estacionalidad_periodo_user: mesFila.pond_month_user || 'Media',
      estacionalidad_periodo_ia: mesFila.pond_month_ia || 'Media',
    });
  });

  /* ---- 2. PONDERACION DIAS --------------------------------------------- */
  app.get('/ponderacion-dias', async () => {
    const r = await query(
      'SELECT id_day, pond_day_user, pond_day_ia FROM ponderacion_dias ORDER BY id_day'
    );
    return r.rows;
  });

  app.put('/actualizar-ponderacion-dia', async (req) => {
    const { id_day, pond_day_user } = req.body as { id_day: number; pond_day_user: string };
    await query('UPDATE ponderacion_dias SET pond_day_user=$1 WHERE id_day=$2', [
      pond_day_user,
      id_day,
    ]);
    dispararRecalculo();
    return { status: 'ok' };
  });

  /* ---- 3. PONDERACION MESES -------------------------------------------- */
  app.get('/ponderacion-meses', async () => {
    const r = await query(
      'SELECT id_month, pond_month_user, pond_month_ia FROM ponderacion_meses ORDER BY id_month'
    );
    return r.rows;
  });

  app.put('/actualizar-ponderacion-mes', async (req) => {
    const { id_month, pond_month_user } = req.body as {
      id_month: number;
      pond_month_user: string;
    };
    await query('UPDATE ponderacion_meses SET pond_month_user=$1 WHERE id_month=$2', [
      pond_month_user,
      id_month,
    ]);
    dispararRecalculo();
    return { status: 'ok' };
  });

  app.put('/actualizar-ponderacion-dias-ia', async (req) => {
    const { dias } = req.body as { dias: Record<string, string> };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [idDay, value] of Object.entries(dias)) {
        await client.query(
          'UPDATE ponderacion_dias SET pond_day_ia=$1 WHERE id_day=$2',
          [value, Number(idDay)]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    dispararRecalculo();
    return { status: 'ok' };
  });

  app.put('/actualizar-ponderacion-meses-ia', async (req) => {
    const { meses } = req.body as { meses: Record<string, string> };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [idMonth, value] of Object.entries(meses)) {
        await client.query(
          'UPDATE ponderacion_meses SET pond_month_ia=$1 WHERE id_month=$2',
          [value, Number(idMonth)]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    dispararRecalculo();
    return { status: 'ok' };
  });

  /* ---- 4. FECHAS / PERIODOS ESPECIALES --------------------------------- */
  app.get('/periodos-especiales', async () => {
    const r = await query(
      `SELECT id_fecha_especial AS id, nombre,
              TO_CHAR(fecha_inicio,'YYYY-MM-DD') AS fecha_inicio,
              TO_CHAR(fecha_fin,   'YYYY-MM-DD') AS fecha_fin,
              pond_especial_user AS pond_user,
              COALESCE(pond_especial_ia, 'Medio') AS pond_ia
       FROM fechas_especiales ORDER BY fecha_inicio`
    );
    return r.rows;
  });

  app.post('/periodos-especiales', async (req, reply) => {
    const { nombre, fecha_inicio, fecha_fin, pond_user } = req.body as {
      nombre?: string;
      fecha_inicio?: string;
      fecha_fin?: string;
      pond_user?: string;
    };
    if (!fecha_inicio || !fecha_fin)
      return reply.code(400).send({ error: 'Faltan fechas' });
    const { pond_ia } = req.body as { pond_ia?: string };
    const r = await query(
      `INSERT INTO fechas_especiales (nombre, fecha_inicio, fecha_fin, pond_especial_user, pond_especial_ia)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [nombre || '', fecha_inicio, fecha_fin, pond_user || 'Medio', pond_ia || 'Medio']
    );
    dispararRecalculo();
    return reply.send(r.rows[0]);
  });

  app.put('/periodos-especiales/:id', async (req) => {
    const { nombre, fecha_inicio, fecha_fin, pond_user, pond_ia } = req.body as {
      nombre?: string;
      fecha_inicio?: string;
      fecha_fin?: string;
      pond_user?: string;
      pond_ia?: string;
    };
    const { id } = req.params as { id: string };
    await query(
      `UPDATE fechas_especiales
       SET nombre=$1, fecha_inicio=$2, fecha_fin=$3, pond_especial_user=$4, pond_especial_ia=$5
       WHERE id_fecha_especial=$6`,
      [nombre || '', fecha_inicio, fecha_fin, pond_user || 'Medio', pond_ia || 'Medio', id]
    );
    dispararRecalculo();
    return { status: 'ok' };
  });

  app.delete('/periodos-especiales/:id', async (req) => {
    const { id } = req.params as { id: string };
    await query('DELETE FROM fechas_especiales WHERE id_fecha_especial=$1', [id]);
    dispararRecalculo();
    return { status: 'ok' };
  });

  /* ---- 5. CONFIGURACION DE PESOS GLOBALES ------------------------------ */
  app.get('/pesos-usuario', async () => {
    const r = await query('SELECT * FROM configuracion_pesos_reglas LIMIT 1');
    if (r.rows.length === 0) return {};
    const cfg = r.rows[0] as Record<string, unknown>;
    return {
      dias: cfg.peso_dias_user,
      mes: cfg.peso_meses_user,
      fechas_especiales: cfg.peso_fechas_especiales_user,
      fechas_reservadas: cfg.peso_fechas_reservadas_user,
      dias_ia: cfg.peso_dias_ia,
      mes_ia: cfg.peso_meses_ia,
      fechas_especiales_ia: cfg.peso_fechas_especiales_ia,
      fechas_reservadas_ia: cfg.peso_fechas_reservadas_ia,
    };
  });

  app.put('/pesos-usuario-ia', async (req, reply) => {
    const { importancia } = req.body as { importancia: Record<string, string> };
    const colMap: Record<string, string> = {
      dias: 'peso_dias_ia',
      mes: 'peso_meses_ia',
      fechas_especiales: 'peso_fechas_especiales_ia',
      fechas_reservadas: 'peso_fechas_reservadas_ia',
    };
    for (const [key, value] of Object.entries(importancia)) {
      const col = colMap[key];
      if (col) await query(`UPDATE configuracion_pesos_reglas SET ${col}=$1`, [value]);
    }
    dispararRecalculo();
    return reply.send({ status: 'ok' });
  });

  app.put('/pesos-usuario', async (req, reply) => {
    const { key, value } = req.body as { key: string; value: string };
    const colMap: Record<string, string> = {
      dias: 'peso_dias_user',
      mes: 'peso_meses_user',
      fechas_especiales: 'peso_fechas_especiales_user',
    };
    const col = colMap[key];
    if (!col) return reply.code(400).send({ error: 'Clave invalida' });
    await query(`UPDATE configuracion_pesos_reglas SET ${col}=$1`, [value]);
    dispararRecalculo();
    return reply.send({ status: 'ok' });
  });

  /* ---- 6. RESERVACIONES ------------------------------------------------ */
  app.get('/reservaciones', async () => {
    const r = await query(
      `SELECT id_reservation,
              TO_CHAR(date_start,'YYYY-MM-DD') AS fecha_evento,
              price AS precio_final, status AS estatus, client AS nombre_cliente
       FROM reservations WHERE status='confirmado' ORDER BY date_start`
    );
    return r.rows;
  });

  app.post('/reservaciones', async (req, reply) => {
    const b = req.body as {
      fecha_evento?: string;
      precio_final?: number;
      nombre_cliente?: string;
      client_primary_contact_name?: string;
      client_primary_contact_phone?: string;
      client_primary_contact_email?: string;
      client_notes?: string;
      pre_start_date?: string;
      pre_price?: number;
      post_end_date?: string;
      post_price?: number;
    };
    if (!b.fecha_evento || !b.precio_final)
      return reply.code(400).send({ error: 'Faltan parametros' });

    const existe = await query(
      "SELECT 1 FROM reservations WHERE date_start=$1 AND status='confirmado'",
      [b.fecha_evento]
    );
    if (existe.rows.length > 0)
      return reply
        .code(400)
        .send({ error: 'Esta fecha ya tiene una reservacion confirmada' });

    if (b.pre_start_date) {
      const conflicto = await query(
        "SELECT 1 FROM reservations WHERE date_start=$1::date AND status='confirmado'",
        [b.pre_start_date]
      );
      if (conflicto.rows.length > 0)
        return reply
          .code(400)
          .send({ error: 'La fecha de inicio pre-evento ya tiene una reservacion confirmada' });
    }

    if (b.post_end_date) {
      const conflicto = await query(
        "SELECT 1 FROM reservations WHERE date_start=$1::date AND status='confirmado'",
        [b.post_end_date]
      );
      if (conflicto.rows.length > 0)
        return reply
          .code(400)
          .send({ error: 'La fecha de fin post-evento ya tiene una reservacion confirmada' });
    }

    const r = await query(
      `INSERT INTO reservations
         (date_start, price, status, client,
          client_primary_contact_name, client_primary_contact_phone,
          client_primary_contact_email, client_notes,
          pre_start_date, pre_price, post_end_date, post_price,
          date_last_edit)
       VALUES ($1, $2, 'confirmado', $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        b.fecha_evento,
        b.precio_final,
        b.nombre_cliente || 'Cliente Gala',
        b.client_primary_contact_name || null,
        b.client_primary_contact_phone || null,
        b.client_primary_contact_email || null,
        b.client_notes || null,
        b.pre_start_date || null,
        b.pre_price || null,
        b.post_end_date || null,
        b.post_price || null,
      ]
    );
    dispararRecalculo();
    return reply.send({ mensaje: 'Reservacion guardada', reservacion: r.rows[0] });
  });

  app.get('/reservaciones/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = await query(
      `SELECT id_reservation,
              TO_CHAR(date_start,'YYYY-MM-DD')             AS fecha_evento,
              price                                         AS precio_final,
              status                                        AS estatus,
              client                                        AS nombre_cliente,
              TO_CHAR(date_registry,'DD/MM/YYYY HH24:MI')   AS fecha_registro,
              TO_CHAR(date_last_edit,'DD/MM/YYYY HH24:MI')  AS fecha_edicion,
              client_primary_contact_name                   AS contacto_nombre,
              client_primary_contact_phone                  AS contacto_telefono,
              client_primary_contact_email                  AS contacto_email,
              client_notes                                  AS notas,
              TO_CHAR(pre_start_date,'YYYY-MM-DD')          AS pre_start_date,
              pre_price,
              TO_CHAR(post_end_date,'YYYY-MM-DD')           AS post_end_date,
              post_price
       FROM reservations WHERE id_reservation = $1`,
      [id]
    );
    if (r.rows.length === 0)
      return reply.code(404).send({ error: 'Reservacion no encontrada' });
    return reply.send(r.rows[0]);
  });

  app.put('/reservaciones/:id', async (req, reply) => {
    const b = req.body as {
      nombre_cliente?: string;
      precio_final?: number;
      contacto_nombre?: string;
      contacto_telefono?: string;
      contacto_email?: string;
      notas?: string;
      pre_start_date?: string;
      pre_price?: number;
      post_end_date?: string;
      post_price?: number;
    };
    const { id } = req.params as { id: string };

    if (b.pre_start_date) {
      const conflicto = await query(
        "SELECT 1 FROM reservations WHERE date_start=$1::date AND status='confirmado' AND id_reservation!=$2",
        [b.pre_start_date, id]
      );
      if (conflicto.rows.length > 0)
        return reply
          .code(400)
          .send({ error: 'La fecha de inicio pre-evento ya tiene una reservacion confirmada' });
    }

    if (b.post_end_date) {
      const conflicto = await query(
        "SELECT 1 FROM reservations WHERE date_start=$1::date AND status='confirmado' AND id_reservation!=$2",
        [b.post_end_date, id]
      );
      if (conflicto.rows.length > 0)
        return reply
          .code(400)
          .send({ error: 'La fecha de fin post-evento ya tiene una reservacion confirmada' });
    }

    await query(
      `UPDATE reservations SET
         client                       = $1,
         price                        = $2,
         client_primary_contact_name  = $3,
         client_primary_contact_phone = $4,
         client_primary_contact_email = $5,
         client_notes                 = $6,
         pre_start_date               = $7,
         pre_price                    = $8,
         post_end_date                = $9,
         post_price                   = $10,
         date_last_edit               = CURRENT_TIMESTAMP
       WHERE id_reservation = $11`,
      [
        b.nombre_cliente || null,
        b.precio_final || null,
        b.contacto_nombre || null,
        b.contacto_telefono || null,
        b.contacto_email || null,
        b.notas || null,
        b.pre_start_date || null,
        b.pre_price || null,
        b.post_end_date || null,
        b.post_price || null,
        id,
      ]
    );
    dispararRecalculo();
    return { status: 'ok' };
  });

  app.delete('/reservaciones/:id', async (req) => {
    const { id } = req.params as { id: string };
    await query('DELETE FROM reservations WHERE id_reservation=$1', [id]);
    dispararRecalculo();
    return { status: 'ok' };
  });
}
