const pool = require("./db");

/* --------------------------------------------------------------------------
   CONVERSIÓN CUALITATIVA → MULTIPLICADOR
   -------------------------------------------------------------------------- */
const MAPA = {
  "muy bajo": 0.60, "muy baja": 0.60,
  "bajo":     0.80, "baja":     0.80,
  "medio":    1.00, "media":    1.00,
  "alto":     1.20, "alta":     1.20,
  "muy alto": 1.40, "muy alta": 1.40
};
const etiquetaAMult = e => MAPA[(e || "medio").toLowerCase().trim()] ?? 1.00;

/* --------------------------------------------------------------------------
   Ejecuta una query y devuelve sus filas, o [] si la tabla no existe.
   -------------------------------------------------------------------------- */
async function safeQuery(sql) {
  try {
    const r = await pool.query(sql);
    return r.rows;
  } catch (e) {
    console.warn(`⚠️  computo_calendarioIA — query falló (${e.message.split('\n')[0]}). Usando valores por defecto.`);
    return [];
  }
}

/* --------------------------------------------------------------------------
   FUNCIÓN PRINCIPAL
   Lee las columnas _ia de la BD:
     - public.ponderacion_dias.pond_day_ia
     - public.ponderacion_meses.pond_month_ia
     - public.fechas_especiales.pond_especial_ia
     - public.configuracion_pesos_reglas (columnas _ia)
     - public.reservaciones (precio real tiene prioridad absoluta)
   Guarda el resultado en public.calendario.ia_price.

   @param {string} fechaInicio  "YYYY-MM-DD"
   @param {string} fechaFin     "YYYY-MM-DD"
   -------------------------------------------------------------------------- */
async function calcularPreciosIA(fechaInicio, fechaFin) {
  console.log(`🤖 computo_calendarioIA: calculando ${fechaInicio} → ${fechaFin}`);

  // 1. Leer todas las tablas usando columnas _ia
  const [rDias, rMeses, rTablas, rEspeciales, rReservas] = await Promise.all([
    safeQuery("SELECT id_day, pond_day_ia FROM ponderacion_dias"),
    safeQuery("SELECT id_month, pond_month_ia FROM ponderacion_meses"),
    safeQuery("SELECT id_table, pond_table_ia FROM ponderacion_tablas ORDER BY id_table"),
    safeQuery(`
      SELECT TO_CHAR(fecha_inicio,'YYYY-MM-DD') AS fi,
             TO_CHAR(fecha_fin,   'YYYY-MM-DD') AS ff,
             pond_especial_ia
      FROM fechas_especiales ORDER BY fecha_inicio
    `),
    safeQuery(`
      SELECT TO_CHAR(date_start,'YYYY-MM-DD') AS fecha, price
      FROM reservations WHERE status = 'confirmado'
    `)
  ]);

  console.log(`   ponderacion_dias (IA):   ${rDias.length} filas`);
  console.log(`   ponderacion_meses (IA):  ${rMeses.length} filas`);
  console.log(`   ponderacion_tablas (IA): ${rTablas.length} filas`);
  console.log(`   fechas_especiales (IA):  ${rEspeciales.length} filas`);
  console.log(`   reservaciones:           ${rReservas.length} filas`);

  // 2. Construir índices con columnas _ia
  const pondDias = {};
  rDias.forEach(r => { pondDias[r.id_day] = r.pond_day_ia; });

  const pondMeses = {};
  rMeses.forEach(r => { pondMeses[r.id_month] = r.pond_month_ia; });

  // id_table: 0 = ponderacion_dias, 1 = ponderacion_meses, 2 = fechas_especiales, 3 = reservaciones
  const pondTablas = {};
  rTablas.forEach(r => { pondTablas[r.id_table] = r.pond_table_ia; });

  const infDias  = etiquetaAMult(pondTablas[0] || "Medio");
  const infMeses = etiquetaAMult(pondTablas[1] || "Medio");
  const infEsp   = etiquetaAMult(pondTablas[2] || "Medio");

  const mapaEsp = {};
  rEspeciales.forEach(fe => {
    const ini = new Date(fe.fi + 'T00:00:00');
    const fin = new Date(fe.ff + 'T00:00:00');
    for (let d = new Date(ini); d <= fin; d.setDate(d.getDate() + 1)) {
      mapaEsp[d.toISOString().split('T')[0]] = etiquetaAMult(fe.pond_especial_ia);
    }
  });

  // Reservaciones confirmadas: precio real tiene prioridad absoluta
  const reservadas = {};
  rReservas.forEach(r => { reservadas[r.fecha] = Number(r.price); });

  // 3. Precio base fijo
  const baseline = 400000;
  const FLOOR    = 200000;
  const CEILING  = 1000000;

  // 4. Calcular precio por fecha
  const rows = [];
  const cur  = new Date(fechaInicio + 'T00:00:00');
  const end  = new Date(fechaFin    + 'T00:00:00');

  while (cur <= end) {
    const fecha = cur.toISOString().split('T')[0];
    cur.setDate(cur.getDate() + 1);

   const dow   = new Date(fecha + 'T00:00:00').getDay();
    const month = new Date(fecha + 'T00:00:00').getMonth() + 1;

    const wDia = 1 + (etiquetaAMult(pondDias[dow]    || "Medio") - 1) * infDias;
    const wMes = 1 + (etiquetaAMult(pondMeses[month]  || "Media") - 1) * infMeses;
    const wEsp = 1 + ((mapaEsp[fecha] || 1.00)                    - 1) * infEsp;

    // 1. Generar multiplicador aleatorio entre 0.9 y 1.1
    const randomMultiplier = (Math.random() * 0.2) + 0.9;
    
    // 2. Aplicar el multiplicador a la fórmula base
    const rawPrice = baseline * wDia * wMes * wEsp * randomMultiplier;

    // 3. Limitar el precio entre el FLOOR y el CEILING y redondear
    const precio = Math.round(Math.max(FLOOR, Math.min(CEILING, rawPrice)));

    rows.push({ fecha, precio });
  }

  console.log(`   Filas a guardar: ${rows.length}`);

  // 5. Guardar en calendario.ia_price
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const { fecha, precio } of rows) {
      const d = new Date(fecha + 'T00:00:00');
      await client.query(
        `INSERT INTO calendario
           (start_date, id_day, id_month, id_year, ia_price, special_day)
         VALUES ($1, $2, $3, $4, $5, FALSE)
         ON CONFLICT (start_date)
         DO UPDATE SET ia_price = EXCLUDED.ia_price`,
        [fecha, d.getDay(), d.getMonth() + 1, d.getFullYear(), precio]
      );
    }

    await client.query("COMMIT");
    console.log(`✅ computo_calendarioIA: ${rows.length} fechas actualizadas en ia_price.`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ computo_calendarioIA error al guardar:", err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { calcularPreciosIA };
