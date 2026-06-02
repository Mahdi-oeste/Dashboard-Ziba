const express = require("express");
const cors    = require("cors");
const pool    = require("./db");
const { calcularPreciosEstadisticos } = require("./computo_calendario");
const { calcularPreciosIA }           = require("./computo_calendarioIA");

const app = express();
app.use(cors());
app.use(express.json());

const OLLAMA_URL = "http://10.207.64.82:11434/api/generate";
const MODELO     = "qwen2.5:7b-instruct";

/* ==========================================================================
   UTILIDADES
   ========================================================================== */
function generarArregloFechas(inicio, fin) {
  const fechas = [];
  const cur = new Date(inicio + 'T00:00:00');
  const end = new Date(fin    + 'T00:00:00');
  while (cur <= end) {
    fechas.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return fechas;
}

/* ==========================================================================
   MOTOR DE RECALCULO — llama a computo_calendario.js en segundo plano
   tras cada escritura en BD. Rango fijo: 2025-01-01 → 2027-12-31
   ========================================================================== */
let recalculoPendiente = false;

/* Clientes SSE conectados — se notifican cuando el calendario se actualiza */
const clientesSSE = new Set();

function notificarClientes() {
  const mensaje = `event: calendario_actualizado\ndata: ${Date.now()}\n\n`;
  clientesSSE.forEach(res => {
    try { res.write(mensaje); } catch (_) { clientesSSE.delete(res); }
  });
}

async function recalcularYGuardarCalendario() {
  if (recalculoPendiente) return;
  recalculoPendiente = true;
  try {
    // Ambos engines corren en paralelo — user en computed_price, IA en ia_price
    await Promise.all([
      calcularPreciosEstadisticos("2025-01-01", "2027-12-31"),
      calcularPreciosIA("2025-01-01", "2027-12-31")
    ]);
    notificarClientes();
  } catch (err) {
    console.error("⚠️ Error en recalcularYGuardarCalendario:", err.message);
  } finally {
    recalculoPendiente = false;
  }
}


/* ==========================================================================
   HEALTHCHECK
   ========================================================================== */
app.get("/health", (req, res) => res.json({ status: "ok" }));

/* ==========================================================================
   SSE — el frontend se suscribe aquí y recibe un evento cada vez que el
   calendario se recalcula, para refrescar la vista sin recargar la página.
   ========================================================================== */
app.get("/eventos", (req, res) => {
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  // Mantener la conexión viva con un ping cada 25 s
  const ping = setInterval(() => {
    try { res.write(": ping\n\n"); } catch (_) {}
  }, 25000);

  clientesSSE.add(res);
  console.log(`📡 Cliente SSE conectado. Total: ${clientesSSE.size}`);

  req.on("close", () => {
    clearInterval(ping);
    clientesSSE.delete(res);
    console.log(`📡 Cliente SSE desconectado. Total: ${clientesSSE.size}`);
  });
});

/* ==========================================================================
   1. ESTRATEGIA DEL PERIODO — Lee todo desde la BD (sin cómputo en request)
   ========================================================================== */
app.get("/estrategia", async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin } = req.query;
    if (!fecha_inicio || !fecha_fin)
      return res.status(400).json({ error: "Faltan fecha_inicio y fecha_fin" });

    const [dbCal, dbDias, dbMeses, dbRes] = await Promise.all([
      pool.query(
        `SELECT TO_CHAR(start_date,'YYYY-MM-DD') AS fecha, ia_price, computed_price
         FROM calendario WHERE start_date BETWEEN $1 AND $2 ORDER BY start_date`,
        [fecha_inicio, fecha_fin]
      ),
      pool.query("SELECT id_day, pond_day_user, pond_day_ia FROM ponderacion_dias"),
      pool.query("SELECT id_month, pond_month_user, pond_month_ia FROM ponderacion_meses"),
      pool.query(
        `SELECT id_reservation,
                TO_CHAR(date_start,'YYYY-MM-DD') AS fecha,
                price AS precio_final, client AS nombre_cliente
         FROM reservations WHERE status='confirmado'
         AND date_start BETWEEN $1 AND $2`,
        [fecha_inicio, fecha_fin]
      )
    ]);

    // Mapa de reservaciones confirmadas del periodo
    const reservadas = {};
    dbRes.rows.forEach(r => { reservadas[r.fecha] = r; });

    // precios_sugeridos_calendario → ia_price (columna original, para S:)
    // precios_computados_calendario → computed_price de computo_calendario.js (para R:)
    const preciosSugeridos  = {};
    const preciosComputados = {};

    dbCal.rows.forEach(r => {
      preciosSugeridos[r.fecha]  = Number(r.ia_price       || 400000);
      preciosComputados[r.fecha] = Number(r.computed_price || r.ia_price || 400000);
    });

    // Ponderación días
    const pondDiasUser = {}, pondDiasIA = {};
    dbDias.rows.forEach(r => {
      pondDiasUser[r.id_day] = r.pond_day_user;
      pondDiasIA[r.id_day]   = r.pond_day_ia;
    });

    // Ponderación meses
    const pondMesesUser = {}, pondMesesIA = {};
    dbMeses.rows.forEach(r => {
      pondMesesUser[r.id_month - 1] = r.pond_month_user;
      pondMesesIA[r.id_month  - 1] = r.pond_month_ia;
    });

    const mesId   = new Date(fecha_inicio + 'T00:00:00').getMonth() + 1;
    const mesFila = dbMeses.rows.find(m => m.id_month === mesId) || {};

    return res.json({
      precios_sugeridos_calendario:       preciosSugeridos,   // S: campo
      precios_computados_calendario:      preciosComputados,  // R: campo
      reservaciones_periodo:              reservadas,
      ponderacion_dias_user:              pondDiasUser,
      ponderacion_dias_ia:                pondDiasIA,
      estacionalidad_meses_completo_user: pondMesesUser,
      estacionalidad_meses_completo_ia:   pondMesesIA,
      estacionalidad_periodo_user: mesFila.pond_month_user || "Media",
      estacionalidad_periodo_ia:   mesFila.pond_month_ia   || "Media"
    });
  } catch (err) {
    console.error("🔴 Error en /estrategia:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   2. PONDERACIÓN DÍAS — lectura y actualización
   ========================================================================== */
app.get("/ponderacion-dias", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT id_day, pond_day_user, pond_day_ia FROM ponderacion_dias ORDER BY id_day"
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/actualizar-ponderacion-dia", async (req, res) => {
  try {
    const { id_day, pond_day_user } = req.body;
    await pool.query(
      "UPDATE ponderacion_dias SET pond_day_user=$1 WHERE id_day=$2",
      [pond_day_user, id_day]
    );
    recalcularYGuardarCalendario().catch(e => console.error("⚠️ Recalculo error:", e.message));
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ==========================================================================
   3. PONDERACIÓN MESES — lectura y actualización
   ========================================================================== */
app.get("/ponderacion-meses", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT id_month, pond_month_user, pond_month_ia FROM ponderacion_meses ORDER BY id_month"
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/actualizar-ponderacion-mes", async (req, res) => {
  try {
    const { id_month, pond_month_user } = req.body;
    await pool.query(
      "UPDATE ponderacion_meses SET pond_month_user=$1 WHERE id_month=$2",
      [pond_month_user, id_month]
    );
    recalcularYGuardarCalendario().catch(e => console.error("⚠️ Recalculo error:", e.message));
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ==========================================================================
   4. FECHAS ESPECIALES  (tabla: public.fechas_especiales)
   ========================================================================== */
app.get("/periodos-especiales", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id_fecha_especial AS id, nombre,
              TO_CHAR(fecha_inicio,'YYYY-MM-DD') AS fecha_inicio,
              TO_CHAR(fecha_fin,   'YYYY-MM-DD') AS fecha_fin,
              pond_especial_user AS pond_user,
              pond_especial_ia   AS pond_ia
       FROM fechas_especiales ORDER BY fecha_inicio`
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/periodos-especiales", async (req, res) => {
  try {
    const { nombre, fecha_inicio, fecha_fin, pond_user } = req.body;
    if (!fecha_inicio || !fecha_fin)
      return res.status(400).json({ error: "Faltan fechas" });
    const r = await pool.query(
      `INSERT INTO fechas_especiales (nombre, fecha_inicio, fecha_fin, pond_especial_user)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [nombre||'', fecha_inicio, fecha_fin, pond_user||'Medio']
    );
    recalcularYGuardarCalendario().catch(e => console.error("⚠️ Recalculo error:", e.message));
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/periodos-especiales/:id", async (req, res) => {
  try {
    const { nombre, fecha_inicio, fecha_fin, pond_user } = req.body;
    await pool.query(
      `UPDATE fechas_especiales
       SET nombre=$1, fecha_inicio=$2, fecha_fin=$3, pond_especial_user=$4
       WHERE id_fecha_especial=$5`,
      [nombre||'', fecha_inicio, fecha_fin, pond_user||'Medio', req.params.id]
    );
    recalcularYGuardarCalendario().catch(e => console.error("⚠️ Recalculo error:", e.message));
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/periodos-especiales/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM fechas_especiales WHERE id_fecha_especial=$1", [req.params.id]);
    recalcularYGuardarCalendario().catch(e => console.error("⚠️ Recalculo error:", e.message));
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ==========================================================================
   5. CONFIGURACIÓN DE PESOS GLOBALES (persiste en BD)
   ========================================================================== */
app.get("/pesos-usuario", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM configuracion_pesos_reglas LIMIT 1");
    if (r.rows.length === 0) return res.json({});
    const cfg = r.rows[0];
    res.json({
      dias:              cfg.peso_dias_user,
      mes:               cfg.peso_meses_user,
      fechas_especiales: cfg.peso_fechas_especiales_user,
      fechas_reservadas: cfg.peso_fechas_reservadas_user,
      dias_ia:              cfg.peso_dias_ia,
      mes_ia:               cfg.peso_meses_ia,
      fechas_especiales_ia: cfg.peso_fechas_especiales_ia,
      fechas_reservadas_ia: cfg.peso_fechas_reservadas_ia
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/pesos-usuario", async (req, res) => {
  try {
    const { key, value } = req.body;
    const colMap = {
      dias:             'peso_dias_user',
      mes:              'peso_meses_user',
      fechas_especiales:'peso_fechas_especiales_user'
    };
    const col = colMap[key];
    if (!col) return res.status(400).json({ error: "Clave inválida" });
    await pool.query(`UPDATE configuracion_pesos_reglas SET ${col}=$1`, [value]);
    recalcularYGuardarCalendario().catch(e => console.error("⚠️ Recalculo error:", e.message));
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ==========================================================================
   6. RESERVACIONES
   ========================================================================== */
app.get("/reservaciones", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id_reservation,
              TO_CHAR(date_start,'YYYY-MM-DD') AS fecha_evento,
              price AS precio_final, status AS estatus, client AS nombre_cliente
       FROM reservations WHERE status='confirmado' ORDER BY date_start`
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/reservaciones", async (req, res) => {
  try {
    const {
      fecha_evento, precio_final, nombre_cliente,
      client_primary_contact_name, client_primary_contact_phone,
      client_primary_contact_email, client_notes
    } = req.body;
    if (!fecha_evento || !precio_final)
      return res.status(400).json({ error: "Faltan parámetros" });

    const existe = await pool.query(
      "SELECT 1 FROM reservations WHERE date_start=$1 AND status='confirmado'",
      [fecha_evento]
    );
    if (existe.rows.length > 0)
      return res.status(400).json({ error: "Esta fecha ya tiene una reservación confirmada" });

    const r = await pool.query(
      `INSERT INTO reservations
         (date_start, price, status, client,
          client_primary_contact_name, client_primary_contact_phone,
          client_primary_contact_email, client_notes, date_last_edit)
       VALUES ($1, $2, 'confirmado', $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        fecha_evento, precio_final, nombre_cliente || "Cliente Gala",
        client_primary_contact_name || null,
        client_primary_contact_phone || null,
        client_primary_contact_email || null,
        client_notes || null
      ]
    );
    recalcularYGuardarCalendario().catch(e => console.error("⚠️ Recalculo error:", e.message));
    res.json({ mensaje: "Reservación guardada", reservacion: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/reservaciones/:id", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id_reservation,
              TO_CHAR(date_start,'YYYY-MM-DD')         AS fecha_evento,
              price                                     AS precio_final,
              status                                    AS estatus,
              client                                    AS nombre_cliente,
              TO_CHAR(date_registry,'DD/MM/YYYY HH24:MI') AS fecha_registro,
              TO_CHAR(date_last_edit,'DD/MM/YYYY HH24:MI') AS fecha_edicion,
              client_primary_contact_name               AS contacto_nombre,
              client_primary_contact_phone              AS contacto_telefono,
              client_primary_contact_email              AS contacto_email,
              client_notes                              AS notas
       FROM reservations WHERE id_reservation = $1`,
      [req.params.id]
    );
    if (r.rows.length === 0)
      return res.status(404).json({ error: "Reservación no encontrada" });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/reservaciones/:id", async (req, res) => {
  try {
    const { nombre_cliente, precio_final, contacto_nombre, contacto_telefono, contacto_email, notas } = req.body;
    await pool.query(
      `UPDATE reservations SET
         client                       = $1,
         price                        = $2,
         client_primary_contact_name  = $3,
         client_primary_contact_phone = $4,
         client_primary_contact_email = $5,
         client_notes                 = $6,
         date_last_edit               = CURRENT_TIMESTAMP
       WHERE id_reservation = $7`,
      [
        nombre_cliente  || null,
        precio_final    || null,
        contacto_nombre  || null,
        contacto_telefono || null,
        contacto_email   || null,
        notas            || null,
        req.params.id
      ]
    );
    recalcularYGuardarCalendario().catch(e => console.error("⚠️ Recalculo error:", e.message));
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/reservaciones/:id", async (req, res) => {
  try {
    await pool.query(
      "UPDATE reservations SET status='cancelado' WHERE id_reservation=$1",
      [req.params.id]
    );
    recalcularYGuardarCalendario().catch(e => console.error("⚠️ Recalculo error:", e.message));
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ==========================================================================
   7. INICIALIZACIÓN DE TABLAS Y ARRANQUE
   ========================================================================== */
async function conectarYCalcular() {
  // Reintentar indefinidamente hasta que la BD esté disponible
  let intento = 0;
  while (true) {
    intento++;
    try {
      await pool.query("SELECT 1");
      console.log("✅ PostgreSQL listo.");
      break;
    } catch (e) {
      console.log(`⏳ Esperando PostgreSQL... intento ${intento} (${e.message})`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  try {
    await pool.query(
      `ALTER TABLE calendario ADD COLUMN IF NOT EXISTS computed_price NUMERIC DEFAULT 400000`
    );

    // Normalizar ponderacion_dias a valores exactos de cat_ponderaciones
    await pool.query(`
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

    console.log("✅ BD verificada.");
    console.log("🔄 Calculando calendario inicial...");
    recalcularYGuardarCalendario().catch(e => console.error("⚠️ Recalculo error:", e.message));
  } catch (err) {
    console.error("⚠️ Error en inicialización:", err.message);
  }
}

// Arrancar HTTP primero — el healthcheck pasa de inmediato
// La conexión a la BD se intenta en segundo plano sin bloquear
app.listen(3000, () => {
  console.log("🚀 Servidor Zibá corriendo en http://localhost:3000");
  conectarYCalcular();
});
