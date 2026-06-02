/* ==========================================================================
   1. GLOBALES Y CONFIGURACIÓN DINÁMICA DE REVENUE MANAGEMENT
   ========================================================================== */
const fechaActual = new Date();
let anioActual = 2026; // Sincronizado al año en curso de la simulación
let mesActual = fechaActual.getMonth(); 
let reservacionesDB = [];
let estrategiaMesActualIA = null; 

// Instancia global para el manejo de Keycloak
let _instanciaKeycloak = null;

// Diccionarios para el control de ponderaciones desde Postgres
let puntosDiaPreferente = {};
let puntosDiaIA = {};
let estacionalidadMesesBase = {};
let estacionalidadMesesIA = {};

// Estado independiente de la tabla Pesos del Usuario
let pesosUsuario = {
  dias: "Medio",
  mes: "Medio",
  fechas_especiales: "Medio",
  fechas_reservadas: "Medio"
};

const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const nombresDiasCompletos = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/* ==========================================================================
   2. KEYCLOAK & INICIALIZACIÓN PROTEGIDA (FLUJO CORE FIJO)
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  try {
    _instanciaKeycloak = new Keycloak({
      url: "https://auth.oeste.mx",
      realm: "ziba-calendario",
      clientId: "ziba-frontend"
    });

    _instanciaKeycloak.init({ 
      onLoad: "login-required",
      checkLoginIframe: false 
    }).then(auth => {
      if (!auth) {
        window.location.reload(); 
      } else {
        console.log("🔐 Autenticación exitosa con Keycloak.");
        iniciarDashboard();
      }
    }).catch(err => {
      console.warn("⚠️ Modo bypass de seguridad activado por fallo de conexión.", err);
      iniciarDashboard();
    });
  } catch (e) {
    console.warn("⚠️ Ejecutando en desarrollo local sin Keycloak.", e);
    iniciarDashboard();
  }
});

async function iniciarDashboard() {
  const monthSelector = document.getElementById("monthSelector");
  if (monthSelector) {
    monthSelector.innerHTML = "";
    nombresMeses.forEach((name, idx) => {
      const opt = document.createElement("option"); opt.value = idx; opt.innerText = name;
      if (idx === mesActual) opt.selected = true;
      monthSelector.appendChild(opt);
    });
  }

  const yearSelector = document.getElementById("yearSelector");
  if (yearSelector) {
    yearSelector.innerHTML = "";
    for (let y = 2025; y <= 2030; y++) {
      const opt = document.createElement("option"); opt.value = y; opt.innerText = y;
      if (y === anioActual) opt.selected = true;
      yearSelector.appendChild(opt);
    }
  }

  /* ==========================================================================
     🏆 INTEGRACIÓN DE LOGUEO DINÁMICO & EVENTOS DEL DROPDOWN DE PERFIL
     ========================================================================== */
  const txtNombre = document.getElementById("txtNombreUsuarioTopbar");
  if (txtNombre) {
    if (_instanciaKeycloak && _instanciaKeycloak.authenticated && _instanciaKeycloak.idTokenParsed) {
      const token = _instanciaKeycloak.idTokenParsed;
      txtNombre.innerText = token.preferred_username || "Usuario Ziba";
    } else {
      txtNombre.innerText = "Administrador Ziba";
    }
  }

  // Lógica interactiva para alternar el menú flotante (Toggle)
  const trigger = document.getElementById("perfilDropdownTrigger");
  const menu = document.getElementById("perfilDropdownMenu");
  
  if (trigger && menu) {
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("show");
    });

    document.addEventListener("click", () => {
      menu.classList.remove("show");
    });
  }

  // Control oficial del Cierre de Sesión conectado a auth.oeste.mx
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (_instanciaKeycloak && _instanciaKeycloak.authenticated) {
        console.log("Cerrando sesión de manera segura en auth.oeste.mx...");
        _instanciaKeycloak.logout({ redirectUri: window.location.origin });
      } else {
        alert("Sesión cerrada correctamente en ambiente local (Bypass de seguridad).");
      }
    });
  }

  // Cargar pesos del usuario guardados (si el backend los persiste)
  await cargarPesosUsuario();
  await cargarPeriodosEspeciales();

  // Carga inicial conectando con el Backend Relacional
  await cargarEstrategiaMesCompletoConIA(false);
  await cargarPeriodosEspeciales();
  await cargarKPIs();
  generarGraficaHistoricaOcupacion();

  // SSE — recarga el calendario automáticamente cuando el backend recalcula precios
  const _sse = new EventSource('/api/eventos');
  _sse.addEventListener('calendario_actualizado', () => {
    cargarEstrategiaMesCompletoConIA(true);
    cargarKPIs();
  });
  _sse.onerror = () => {
    console.warn('SSE: reconectando...');
  };
}

/* ==========================================================================
   2B. TABLA PESOS DEL USUARIO — CARGA Y PERSISTENCIA INDEPENDIENTE
   ========================================================================== */

/**
 * Mapeo de valores de texto a clases CSS de semáforo.
 * Aplica tanto a los selectores de Pesos del Usuario como a los de Meses.
 */
const mapaClasesPesos = {
  "Muy alto":  "very-high",
  "Alto":      "high",
  "Medio":     "medio",
  "Bajo":      "low",
  "Muy bajo":  "very-low"
};

/**
 * Intenta cargar los pesos del usuario desde el backend.
 * Si falla, mantiene los valores por defecto (Medio).
 */
async function cargarPesosUsuario() {
  try {
    const response = await fetch("/api/pesos-usuario");
    if (response.ok) {
      const data = await response.json();
      pesosUsuario = { ...pesosUsuario, ...data };

      // Actualizar badges IA de la tabla Ponderaciones
      const iaBadges = {
        dias:              data.dias_ia,
        mes:               data.mes_ia,
        fechas_especiales: data.fechas_especiales_ia,
        fechas_reservadas: data.fechas_reservadas_ia
      };
      Object.entries(iaBadges).forEach(([key, val]) => {
        const badge = document.getElementById(`ia-badge-${key}`);
        if (badge && val) {
          const clase = mapaClasesPesos[val] || "medio";
          badge.className = `contenedor-badge-ia ${clase}`;
          badge.innerText = val;
        }
      });
    }
  } catch (error) {
    console.warn("ℹ️ No se pudieron cargar los pesos del usuario desde el backend. Usando valores por defecto.", error);
  }

  sincronizarSelectoresPesosUsuario();
}

/**
 * Actualiza el estado visual de todos los selectores de la tabla Pesos del Usuario
 * para que reflejen los valores del objeto `pesosUsuario`.
 */
function sincronizarSelectoresPesosUsuario() {
  const selectores = document.querySelectorAll(".select-peso-usuario");
  selectores.forEach(sel => {
    const key = sel.dataset.pesoKey; // data-peso-key → dataset.pesoKey (camelCase automático)
    if (key && pesosUsuario[key]) {
      sel.value = pesosUsuario[key];
      sel.className = "select-peso-usuario select-mes-cell " + (mapaClasesPesos[pesosUsuario[key]] || "medio");
    }
  });
}

/**
 * Manejador del cambio en cualquier selector de la tabla Pesos del Usuario.
 * Actualiza el estado local, la clase semáforo en tiempo real y persiste en backend.
 * @param {HTMLSelectElement} selectEl 
 */
async function actualizarPesoUsuario(selectEl) {
  const key = selectEl.dataset.pesoKey;
  const val = selectEl.value;

  // 1. Actualizar estado local
  pesosUsuario[key] = val;

  // 2. Reactividad visual inmediata: cambiar clase semáforo
  selectEl.className = "select-peso-usuario select-mes-cell " + (mapaClasesPesos[val] || "medio");

  // 3. Persistir en el backend (si está disponible)
  try {
    const response = await fetch("/api/pesos-usuario", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: val })
    });

    if (response.ok) {
      console.log(`💾 Peso del usuario guardado: ${key} -> ${val}`);
      await cargarEstrategiaMesCompletoConIA(true);
    }
  } catch (error) {
    console.warn(`ℹ️ Backend no disponible. Peso registrado solo en memoria: ${key} -> ${val}`);
  }
}

/* ==========================================================================
   3. CONECTOR CORE: HISTORIAL REAL + CONSULTA HÍBRIDA AL SERVIDOR
   ========================================================================== */
async function cargarEstrategiaMesCompletoConIA(esManual = false) {
  const primerDia = `${anioActual}-${String(mesActual + 1).padStart(2, '0')}-01`;
  const ultimoDia = `${anioActual}-${String(mesActual + 1).padStart(2, '0')}-${new Date(anioActual, mesActual + 1, 0).getDate()}`;

  try {
    const response = await fetch(
      `/api/estrategia?fecha_inicio=${primerDia}&fecha_fin=${ultimoDia}`
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    puntosDiaPreferente = data.ponderacion_dias_user || {};
    puntosDiaIA         = data.ponderacion_dias_ia   || {};

    // Cargar los 12 meses completos desde la BD
    if (data.estacionalidad_meses_completo_user) {
      Object.entries(data.estacionalidad_meses_completo_user).forEach(([k, v]) => {
        estacionalidadMesesBase[parseInt(k)] = v;
      });
    }
    if (data.estacionalidad_meses_completo_ia) {
      Object.entries(data.estacionalidad_meses_completo_ia).forEach(([k, v]) => {
        estacionalidadMesesIA[parseInt(k)] = v;
      });
    }

    estrategiaMesActualIA = data;

    renderizarConsolaParametros();
    renderizarCalendarioDinamico();

  } catch (error) {
    console.error("🔴 Error en la carga del periodo:", error);
  }
}

/* ==========================================================================
   4. RENDERIZACIÓN DE LAS TABLAS DEL DASHBOARD (TABLAS 1 Y 2)
   ========================================================================== */
function renderizarConsolaParametros() {
  const tbodyDiasBase = document.getElementById("tbodyDiasBase");
  const tbodyMesesBase = document.getElementById("tbodyMesesBase");

  const mapaClasesEstacionales = {
    "Muy alta": "very-high", "Alta": "high", "Media": "medio", "Baja": "low", "Muy baja": "very-low",
    "Muy alto": "very-high", "Alto": "high", "Medio": "medio", "Bajo": "low", "Muy bajo": "very-low"
  };

  const opcionesDia = ["Muy alto", "Alto", "Medio", "Bajo", "Muy bajo"];
  const ordenDias = [1, 2, 3, 4, 5, 6, 0];
  if (tbodyDiasBase) {
    tbodyDiasBase.innerHTML = "";
    ordenDias.forEach(d => {
      const tr = document.createElement("tr");
      const valUser = puntosDiaPreferente[d] !== undefined ? puntosDiaPreferente[d] : "Medio";
      const valIA   = puntosDiaIA[d]         !== undefined ? puntosDiaIA[d]         : "Medio";
      const claseUser = mapaClasesEstacionales[valUser] || "medio";
      const claseIA   = mapaClasesEstacionales[valIA]   || "medio";

      const optsHtml = opcionesDia.map(o =>
        `<option value="${o}" ${valUser === o ? 'selected' : ''}>${o}</option>`
      ).join('');

      tr.innerHTML = `
        <td>${nombresDiasCompletos[d]}</td>
        <td>
          <select class="select-mes-cell ${claseUser}" data-day="${d}" onchange="actualizarPuntosDiaLocal(this)">
            ${optsHtml}
          </select>
        </td>
        <td><div class="contenedor-badge-ia ${claseIA}">${valIA}</div></td>
      `;
      tbodyDiasBase.appendChild(tr);
    });
  }

  if (tbodyMesesBase) {
    tbodyMesesBase.innerHTML = "";
    
    // Respaldo oficial analítico de Jardín Zibá
    const demandaDefectoMeses = ["Muy baja", "Baja", "Media", "Media", "Alta", "Alta", "Media", "Baja", "Muy baja", "Alta", "Muy alta", "Muy alta"];

    nombresMeses.forEach((m, idx) => {
      const tr = document.createElement("tr");
      
      const catActual = estacionalidadMesesBase[idx] || demandaDefectoMeses[idx];
      let catIA = estacionalidadMesesIA[idx] || catActual;
      
      const claseColorUser = mapaClasesEstacionales[catActual] || "medio";
      const claseColorIA = mapaClasesEstacionales[catIA] || "medio";

      tr.innerHTML = `
        <td>${m}</td>
        <td>
          <select class="select-mes-cell ${claseColorUser}" data-month="${idx + 1}" onchange="actualizarEstacionalidadMesLocal(this)">
            <option value="Muy alta" ${catActual === 'Muy alta' ? 'selected' : ''}>Muy Alta </option>
            <option value="Alta" ${catActual === 'Alta' ? 'selected' : ''}>Alta </option>
            <option value="Media" ${catActual === 'Media' ? 'selected' : ''}>Media </option>
            <option value="Baja" ${catActual === 'Baja' ? 'selected' : ''}>Baja </option>
            <option value="Muy baja" ${catActual === 'Muy baja' ? 'selected' : ''}>Muy Baja </option>
          </select>
        </td>
        <td>
          <div class="contenedor-badge-ia ${claseColorIA}">${catIA}</div>
        </td>
      `;
      tbodyMesesBase.appendChild(tr);
    });
  }
}

async function actualizarEstacionalidadMesLocal(selectEl) {
  const monthId = parseInt(selectEl.dataset.month);
  const val = selectEl.value;
  const idxMes = monthId - 1;

  const mapaClasesEstacionales = {
    "Muy alta": "very-high", "Alta": "high", "Media": "medio", "Baja": "low", "Muy baja": "very-low"
  };

  // 🏆 REACTIVIDAD EN VIVO: Removemos los colores viejos del select y aplicamos el nuevo al instante
  selectEl.className = "select-mes-cell " + (mapaClasesEstacionales[val] || "medio");

  estacionalidadMesesBase[idxMes] = val;
  estacionalidadMesesIA[idxMes] = val; 

  try {
    const response = await fetch("/api/actualizar-ponderacion-mes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_month: monthId, pond_month_user: val })
    });

    if (response.ok) {
      console.log(`💾 Guardado en Postgres: Mes ${monthId} -> ${val}`);
    }

    await cargarEstrategiaMesCompletoConIA(true);
  } catch (error) {
    console.error("Error al actualizar ponderación mensual:", error);
  }
}

/* ==========================================================================
   5. PERSISTENCIA DE CAMBIOS MANUALES A POSTGRES
   ========================================================================== */
async function actualizarPuntosDiaLocal(selectEl) {
  const day = parseInt(selectEl.dataset.day);
  const val = selectEl.value;

  // Actualizar color del select de inmediato
  const mapaClases = {
    "Muy alto": "very-high", "Alto": "high", "Medio": "medio",
    "Bajo": "low", "Muy bajo": "very-low"
  };
  selectEl.className = "select-mes-cell " + (mapaClases[val] || "medio");

  try {
    await fetch("/api/actualizar-ponderacion-dia", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_day: day, pond_day_user: val })
    });
    await cargarEstrategiaMesCompletoConIA(true);
  } catch (error) {
    console.error("Error al actualizar ponderación de día:", error);
  }
}

function renderVisualOnly() {
  renderizarConsolaParametros();
}

/* ==========================================================================
   6. RENDERIZACIÓN DEL CALENDARIO DINÁMICO & CÓMPUTO GLOBAL DE KPIS
   ========================================================================== */
/* --------------------------------------------------------------------------
   Convierte un color hex (#rrggbb) a [H, S%, L%].
   -------------------------------------------------------------------------- */
function hexToHsl(hex) {
  hex = hex.trim().replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if      (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

/* --------------------------------------------------------------------------
   Interpola bg, border y text a lo largo del gradiente de precio.
   Lee colores y textos directamente de las variables CSS --semaforo-* para
   mantener una única fuente de verdad.
   t = 0  →  semaforo-very-high (precio máximo del mes)
   t = 1  →  semaforo-very-low  (precio mínimo del mes)
   Se llama con (1 - t): mínimo = very-low, máximo = very-high.
   Devuelve { bg, border, text, iaText }.
   -------------------------------------------------------------------------- */
function calcularColorGradiente(t) {
  const cs = getComputedStyle(document.documentElement);
  const semaforoNiveles = [
    { bgVar: '--semaforo-very-high-bg', textVar: '--semaforo-very-high-text', iaTextVar: '--semaforo-very-high-ia-text', pos: 0.00 },
    { bgVar: '--semaforo-high-bg',      textVar: '--semaforo-high-text',      iaTextVar: '--semaforo-high-ia-text',      pos: 0.25 },
    { bgVar: '--semaforo-medio-bg',     textVar: '--semaforo-medio-text',     iaTextVar: '--semaforo-medio-ia-text',     pos: 0.50 },
    { bgVar: '--semaforo-low-bg',       textVar: '--semaforo-low-text',       iaTextVar: '--semaforo-low-ia-text',       pos: 0.75 },
    { bgVar: '--semaforo-very-low-bg',  textVar: '--semaforo-very-low-text',  iaTextVar: '--semaforo-very-low-ia-text',  pos: 1.00 },
  ];

  const stops = semaforoNiveles.map(({ bgVar, textVar, iaTextVar, pos }) => ({
    pos,
    hsl:    hexToHsl(cs.getPropertyValue(bgVar).trim()),
    text:   cs.getPropertyValue(textVar).trim(),
    iaText: cs.getPropertyValue(iaTextVar).trim(),
  }));

  t = Math.max(0, Math.min(1, t));
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1].pos) i++;

  const { pos: p0, hsl: [h0, s0, l0], text: text0, iaText: iaText0 } = stops[i];
  const { pos: p1, hsl: [h1, s1, l1], text: text1, iaText: iaText1 } = stops[i + 1];
  const lt = (p1 === p0) ? 0 : (t - p0) / (p1 - p0);

  const h = h0 + (h1 - h0) * lt;
  const s = s0 + (s1 - s0) * lt;
  const l = l0 + (l1 - l0) * lt;
  const nearestFirst = lt < 0.5;

  return {
    bg:     `hsla(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%, 1)`,
    border: `hsla(${h.toFixed(1)}, ${Math.min(100, s + 15).toFixed(1)}%, ${Math.max(0, l - 12).toFixed(1)}%, 1)`,
    text:   nearestFirst ? text0   : text1,    // snap to nearest semaphore tier
    iaText: nearestFirst ? iaText0 : iaText1,  // exclusive IA text color
  };
}

async function renderizarCalendarioDinamico() {
  const calendarMonthTitle = document.getElementById("calendarMonthTitle");
  if (calendarMonthTitle) calendarMonthTitle.innerText = `${nombresMeses[mesActual]} ${anioActual}`;

  const container = document.getElementById("singleCalendarContainer");
  if (!container) return;
  container.innerHTML = "";

  ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].forEach(d => {
    const cell = document.createElement("div"); cell.className = "day-name-header"; cell.innerText = d;
    container.appendChild(cell);
  });

  // Reservaciones vienen del objeto estrategiaMesActualIA cargado previamente
  reservacionesDB = estrategiaMesActualIA?.reservaciones_periodo
    ? Object.values(estrategiaMesActualIA.reservaciones_periodo)
    : [];

  const diaJS = new Date(anioActual, mesActual, 1).getDay();
  const celdasVacias = diaJS === 0 ? 6 : diaJS - 1;
  const totalDiasMes = new Date(anioActual, mesActual + 1, 0).getDate();
  const stringMes = String(mesActual + 1).padStart(2, '0');

  // Pre-calcular min/max de precios computados de días libres para el gradiente
  let minPrecioMes = Infinity, maxPrecioMes = -Infinity;
  for (let d = 1; d <= totalDiasMes; d++) {
    const f = `${anioActual}-${stringMes}-${String(d).padStart(2, '0')}`;
    if (!estrategiaMesActualIA?.reservaciones_periodo?.[f]) {
      const p = estrategiaMesActualIA?.precios_computados_calendario?.[f];
      if (p != null) {
        minPrecioMes = Math.min(minPrecioMes, p);
        maxPrecioMes = Math.max(maxPrecioMes, p);
      }
    }
  }
  if (!isFinite(minPrecioMes)) minPrecioMes = maxPrecioMes = 400000;

  for (let i = 0; i < celdasVacias; i++) {
    const emptyCell = document.createElement("div"); emptyCell.className = "calendar-wrapper-empty";
    container.appendChild(emptyCell);
  }

  for (let d = 1; d <= totalDiasMes; d++) {
    const fechaTextoIso = `${anioActual}-${stringMes}-${String(d).padStart(2, '0')}`;

    const reservaReal = estrategiaMesActualIA?.reservaciones_periodo?.[fechaTextoIso] || null;
    const estaOcupado = !!reservaReal;

    // S: precio sugerido (ia_price — columna original del calendario)
    let precioSugeridoIa = 400000;
    if (estrategiaMesActualIA?.precios_sugeridos_calendario?.[fechaTextoIso] !== undefined) {
      precioSugeridoIa = estrategiaMesActualIA.precios_sugeridos_calendario[fechaTextoIso];
    }

    // R: precio computado por computo_calendario.js (computed_price)
    let precioComputado = null;
    if (estrategiaMesActualIA?.precios_computados_calendario?.[fechaTextoIso] !== undefined) {
      precioComputado = estrategiaMesActualIA.precios_computados_calendario[fechaTextoIso];
    }

    const dayElement = document.createElement("div");
    dayElement.className = `day ${estaOcupado ? 'ocupado' : 'libre'}`;

    // Aplicar color de gradiente a días libres según precio relativo del mes
    if (!estaOcupado && precioComputado !== null) {
      const t = (minPrecioMes === maxPrecioMes)
        ? 0.5
        : (precioComputado - minPrecioMes) / (maxPrecioMes - minPrecioMes);
      const { bg, border, text } = calcularColorGradiente(1 - t);
      dayElement.style.setProperty('--cal-libre-bg',    bg);
      dayElement.style.setProperty('--cal-libre-border', border);
      dayElement.style.setProperty('--cal-libre-text',  text);   // día-número
      dayElement.style.setProperty('--cal-user-price',  text);   // R: precio + "Usuario:" label

      // IA price: exclusive --semaforo-*-ia-text color based on IA price relative to month range
      const tIA = (minPrecioMes === maxPrecioMes)
        ? 0.5
        : (precioSugeridoIa - minPrecioMes) / (maxPrecioMes - minPrecioMes);
      const { iaText } = calcularColorGradiente(1 - tIA);
      dayElement.style.setProperty('--cal-ia-price', iaText);    // IA: precio + "IA:" label
    }
    
    if (d === fechaActual.getDate() && mesActual === fechaActual.getMonth() && anioActual === fechaActual.getFullYear()) {
      dayElement.classList.add("today");
    }

    const labelUsuario = precioComputado !== null
      ? '$' + (precioComputado / 1000).toFixed(0) + 'k'
      : '—';
    const labelIA = '$' + (precioSugeridoIa / 1000).toFixed(0) + 'k';

    dayElement.innerHTML = `
      <span class="day-number">${d}</span>
      <div class="day-prices-container">
        <div class="price-row user-price"><span>Usuario:</span>${labelUsuario}</div>
        <div class="price-row ia-price"><span>IA:</span>${labelIA}</div>
      </div>
    `;

    dayElement.addEventListener("click", () => {
      if (estaOcupado) {
        abrirModalDetalle(reservaReal);
      } else {
        // Pre-fill modal with computed_price as the suggested price
        abrirModalAgregar(fechaTextoIso, precioComputado ?? precioSugeridoIa);
      }
    });

    container.appendChild(dayElement);
  }

}

/* ==========================================================================
   KPIs GLOBALES 2026-2027
   ========================================================================== */
async function cargarKPIs() {
  try {
    const res = await fetch('/api/reservaciones');
    if (!res.ok) return;
    const todas = await res.json();

    const DIAS_PERIODO = 730; // 2026 + 2027 = 2 años

    const total    = todas.length;
    // Suma de ingresos
    const ingresos = todas.reduce((sum, r) => sum + (parseFloat(r.precio_final) || 0), 0);
    const ocupacion = ((total / DIAS_PERIODO) * 100).toFixed(1);

    // 🏆 CALCULAR MÍNIMO Y MÁXIMO DE TARIFAS REALES
    let minTarifa = 0;
    let maxTarifa = 0;
    // Extraemos solo los precios que sean números válidos y mayores a 0
    const preciosValidos = todas.map(r => parseFloat(r.precio_final)).filter(p => !isNaN(p) && p > 0);
    
    if (preciosValidos.length > 0) {
      minTarifa = Math.min(...preciosValidos);
      maxTarifa = Math.max(...preciosValidos);
    }

    const elRes = document.getElementById("kpiReservaciones");
    const elIng = document.getElementById("kpiIngreso");
    const elOcu = document.getElementById("kpiOcupacion");
    const elRango = document.getElementById("kpiRangoTarifas");

    if (elRes) elRes.innerText = total;
    
    // Inyectamos el total con la clase .text-mn para hacerlo más pequeño
    if (elIng) elIng.innerHTML = `$${ingresos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span class="text-mn">M.N.</span>`;
    
    if (elOcu) elOcu.innerText = `${ocupacion}%`;
    
    // Inyectamos el rango dinámico en formato: $Min - $Max M.N.
    if (elRango) {
       if (preciosValidos.length > 0) {
         // Se omiten los decimales (.00) en el rango para ahorrar espacio y que quepa en 1 sola línea
         elRango.innerHTML = `$${minTarifa.toLocaleString('es-MX')} - $${maxTarifa.toLocaleString('es-MX')} <span class="text-mn">M.N.</span>`;
       } else {
         elRango.innerHTML = `$0 - $0 <span class="text-mn">M.N.</span>`;
       }
    }
    
  } catch (e) {
    console.warn('No se pudieron cargar los KPIs globales.', e);
  }
}

/* ==========================================================================
   7. CONTROLES DE NAVEGACIÓN DE LOS SELECTORES
   ========================================================================== */
async function navegarAnioBoton(valor) {
  anioActual = Math.min(2030, Math.max(2025, anioActual + valor));
  const el = document.getElementById("yearSelector"); if (el) el.value = anioActual;
  await cargarEstrategiaMesCompletoConIA(false);
}

async function navegarMes(valor) {
  mesActual += valor;
  if (mesActual > 11) { mesActual = 0; anioActual++; }
  else if (mesActual < 0) { mesActual = 11; anioActual--; }
  
  const mEl = document.getElementById("monthSelector"); if (mEl) mEl.value = mesActual;
  const yEl = document.getElementById("yearSelector"); if (yEl) yEl.value = anioActual;
  await cargarEstrategiaMesCompletoConIA(false);
}

async function actualizarCalendarioPorSelectores() {
  const mEl = document.getElementById("monthSelector"); if (mEl) mesActual = parseInt(mEl.value);
  const yEl = document.getElementById("yearSelector"); if (yEl) anioActual = parseInt(yEl.value);
  await cargarEstrategiaMesCompletoConIA(false);
}

/* ==========================================================================
   8. PERIODOS ESPECIALES — CRUD COMPLETO
   ========================================================================== */

async function cargarPeriodosEspeciales() {
  try {
    const res = await fetch("/api/periodos-especiales");
    const data = await res.json();
    renderizarPeriodosEspeciales(data);
  } catch (e) {
    console.warn("No se pudieron cargar los periodos especiales.", e);
    renderizarPeriodosEspeciales([]);
  }
}

const OPCIONES_POND = ["Muy alto", "Alto", "Medio", "Bajo", "Muy bajo"];
const MAPA_POND_CLASE = {
  "Muy alto": "very-high", "Alto": "high", "Medio": "medio",
  "Bajo": "low", "Muy bajo": "very-low"
};

function renderizarPeriodosEspeciales(periodos) {
  const tbody = document.getElementById("tbodyPeriodosEspeciales");
  if (!tbody) return;
  tbody.innerHTML = "";

  periodos.forEach(p => {
    const tr = document.createElement("tr");
    tr.dataset.id = p.id;
    const pondUser = p.pond_user || "Medio";
    const pondIA   = p.pond_ia   || "Medio";
    const claseUser = MAPA_POND_CLASE[pondUser] || "medio";
    const claseIA   = MAPA_POND_CLASE[pondIA]   || "medio";

    const optsHtml = OPCIONES_POND.map(o =>
      `<option value="${o}" ${pondUser === o ? 'selected' : ''}>${o}</option>`
    ).join('');

    tr.innerHTML = `
      <td>
        <input type="text" class="input-table-cell" placeholder="Nombre del período"
               value="${p.nombre}" style="width:100%; margin-bottom:4px;"
               onchange="actualizarCampoPeriodo(${p.id}, 'nombre', this.value)">
        <div class="rango-fecha-container">
          <input type="date" class="input-date-custom" value="${p.fecha_inicio}"
                 onchange="actualizarCampoPeriodo(${p.id}, 'fecha_inicio', this.value)">
          <span class="separador-fecha">al</span>
          <input type="date" class="input-date-custom" value="${p.fecha_fin}"
                 onchange="actualizarCampoPeriodo(${p.id}, 'fecha_fin', this.value)">
        </div>
      </td>
      <td style="vertical-align:middle;">
        <select class="select-mes-cell ${claseUser}"
                onchange="actualizarCampoPeriodo(${p.id}, 'pond_user', this.value); this.className='select-mes-cell '+(MAPA_POND_CLASE[this.value]||'medio')">
          ${optsHtml}
        </select>
      </td>
      <td style="text-align:center; vertical-align:middle;">
        <div class="contenedor-badge-ia ${claseIA}">${pondIA}</div>
      </td>
      <td style="text-align:center; vertical-align:middle;">
        <button class="btn-eliminar-periodo" onclick="eliminarPeriodoEspecial(${p.id}, this)">✕</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Fila para agregar nuevo período
  const trNuevo = document.createElement("tr");
  trNuevo.id = "fila-nuevo-periodo";
  trNuevo.innerHTML = `
    <td colspan="4" style="text-align:center; padding: 10px;">
      <button class="btn-agregar-periodo" onclick="agregarNuevoPeriodo()">+ Agregar Período</button>
    </td>
  `;
  tbody.appendChild(trNuevo);
}

function obtenerClasePorScore(label) {
  return MAPA_POND_CLASE[label] || "medio";
}

async function agregarNuevoPeriodo() {
  const hoy = new Date().toISOString().split("T")[0];
  try {
    const res = await fetch("/api/periodos-especiales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: "", fecha_inicio: hoy, fecha_fin: hoy, pond_user: "Medio", pond_ia: "Medio" })
    });
    if (res.ok) {
      // Reload the table immediately so the new row is visible for editing
      await cargarPeriodosEspeciales();
      // Calendar recalculation runs in background via SSE — no need to await here
      cargarEstrategiaMesCompletoConIA(true);
    }
  } catch (e) {
    console.error("Error al agregar período especial.", e);
  }
}

async function actualizarCampoPeriodo(id, campo, valor) {
  // Leer el estado actual de la fila para enviar todos los campos en el PUT
  const tr = document.querySelector(`#tbodyPeriodosEspeciales tr[data-id="${id}"]`);
  if (!tr) return;
  const inputs  = tr.querySelectorAll("input");
  const selects = tr.querySelectorAll("select");
  const nombre      = inputs[0].value;
  const fechaInicio = inputs[1].value;
  const fechaFin    = inputs[2].value;
  const pondUser    = selects[0]?.value || "Medio";

  const payload = { nombre, fecha_inicio: fechaInicio, fecha_fin: fechaFin, pond_user: pondUser, pond_ia: "Medio" };
  if (campo === "nombre")       payload.nombre       = valor;
  if (campo === "fecha_inicio") payload.fecha_inicio = valor;
  if (campo === "fecha_fin")    payload.fecha_fin    = valor;
  if (campo === "pond_user")    payload.pond_user    = valor;

  try {
    await fetch(`/api/periodos-especiales/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.error("Error al actualizar período especial.", e);
  }
}

async function eliminarPeriodoEspecial(id, btn) {
  btn.disabled = true;
  try {
    await fetch(`/api/periodos-especiales/${id}`, { method: "DELETE" });
    await cargarPeriodosEspeciales();
    await cargarEstrategiaMesCompletoConIA(true);
  } catch (e) {
    console.error("Error al eliminar período especial.", e);
    btn.disabled = false;
  }
}

// Stubs para compatibilidad con los atributos inline del HTML original
function calcularPeriodoEspecialIA() {}
function guardarPeriodoEspecialBD() {}

/* ==========================================================================
   9. MODAL DE RESERVACIÓN — AGREGAR / VER / ELIMINAR
   ========================================================================== */
let _modalFechaActiva = null;
let _modalReservaActiva = null;

function abrirModalAgregar(fecha, precioIA) {
  _modalFechaActiva = fecha;
  _modalReservaActiva = null;

  const [anio, mes, dia] = fecha.split('-');
  document.getElementById('modalFechaLabel').innerText =
    `${parseInt(dia)} de ${nombresMeses[parseInt(mes) - 1]} de ${anio}`;
  document.getElementById('inputNombreCliente').value = '';
  document.getElementById('inputPrecioFinal').value = precioIA;
  document.getElementById('inputContactName').value  = '';
  document.getElementById('inputContactPhone').value = '';
  document.getElementById('inputContactEmail').value = '';
  document.getElementById('inputClientNotes').value  = '';
  document.getElementById('modalPrecioIA').innerText =
    `$${Number(precioIA).toLocaleString('es-MX')} MXN`;

  document.getElementById('modalVistaAgregar').style.display = 'block';
  document.getElementById('modalVistaDetalle').style.display = 'none';
  document.getElementById('modalReservacion').style.display = 'flex';
  document.getElementById('inputNombreCliente').focus();
}

async function abrirModalDetalle(reserva) {
  _modalFechaActiva  = reserva.fecha;
  _modalReservaActiva = reserva;

  // Show modal immediately with basic data from the calendar payload
  const [anio, mes, dia] = reserva.fecha.split('-');
  document.getElementById('modalDetalleFecha').innerText =
    `${parseInt(dia)} de ${nombresMeses[parseInt(mes) - 1]} de ${anio}`;
  document.getElementById('modalDetalleId').innerText       = `#${reserva.id_reservation}`;
  document.getElementById('editDetalleCliente').value       = reserva.nombre_cliente || '';
  document.getElementById('editDetallePrecio').value        = reserva.precio_final   || '';
  document.getElementById('editDetalleContacto').value      = '';
  document.getElementById('editDetalleTelefono').value      = '';
  document.getElementById('editDetalleEmail').value         = '';
  document.getElementById('editDetalleNotas').value         = '';
  document.getElementById('modalDetalleRegistro').innerText = '—';
  document.getElementById('modalDetalleLoading').style.display = 'block';
  document.getElementById('btnGuardarDetalle').disabled = true;

  document.getElementById('modalVistaAgregar').style.display = 'none';
  document.getElementById('modalVistaDetalle').style.display = 'block';
  document.getElementById('modalReservacion').style.display  = 'flex';

  // Fetch full details from the database and populate editable inputs
  try {
    const res  = await fetch(`/api/reservaciones/${reserva.id_reservation}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.getElementById('editDetalleCliente').value       = data.nombre_cliente       || '';
    document.getElementById('editDetallePrecio').value        = data.precio_final         || '';
    document.getElementById('editDetalleContacto').value      = data.contacto_nombre      || '';
    document.getElementById('editDetalleTelefono').value      = data.contacto_telefono    || '';
    document.getElementById('editDetalleEmail').value         = data.contacto_email       || '';
    document.getElementById('editDetalleNotas').value         = data.notas                || '';
    document.getElementById('modalDetalleRegistro').innerText = data.fecha_registro       || '—';
  } catch (err) {
    console.warn('No se pudo cargar el detalle completo de la reservación:', err.message);
  } finally {
    document.getElementById('modalDetalleLoading').style.display = 'none';
    document.getElementById('btnGuardarDetalle').disabled = false;
  }
}

async function guardarDetalleReservacion() {
  if (!_modalReservaActiva) return;
  const btn = document.getElementById('btnGuardarDetalle');
  btn.disabled = true;
  btn.innerText = 'Guardando...';

  try {
    const res = await fetch(`/api/reservaciones/${_modalReservaActiva.id_reservation}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre_cliente:    document.getElementById('editDetalleCliente').value.trim(),
        precio_final:      parseFloat(document.getElementById('editDetallePrecio').value) || null,
        contacto_nombre:   document.getElementById('editDetalleContacto').value.trim() || null,
        contacto_telefono: document.getElementById('editDetalleTelefono').value.trim() || null,
        contacto_email:    document.getElementById('editDetalleEmail').value.trim()    || null,
        notas:             document.getElementById('editDetalleNotas').value.trim()    || null,
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    cerrarModalReservacion();
    await cargarEstrategiaMesCompletoConIA(true);
  } catch (err) {
    alert('Error al guardar: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = '💾 Guardar';
  }
}

function cerrarModalReservacion() {
  document.getElementById('modalReservacion').style.display = 'none';
  _modalFechaActiva = null;
  _modalReservaActiva = null;
}

async function confirmarReservacion() {
  const nombre        = document.getElementById('inputNombreCliente').value.trim() || 'Cliente Gala';
  const precio        = parseFloat(document.getElementById('inputPrecioFinal').value);
  const fecha         = _modalFechaActiva;
  const contactName   = document.getElementById('inputContactName').value.trim()  || null;
  const contactPhone  = document.getElementById('inputContactPhone').value.trim() || null;
  const contactEmail  = document.getElementById('inputContactEmail').value.trim() || null;
  const clientNotes   = document.getElementById('inputClientNotes').value.trim()  || null;

  if (!fecha || isNaN(precio) || precio <= 0) {
    alert('Por favor ingresa un precio válido.');
    return;
  }

  const btnConfirmar = document.querySelector('.btn-modal-confirmar');
  btnConfirmar.disabled = true;
  btnConfirmar.innerText = 'Guardando...';

  try {
    const res = await fetch('/api/reservaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fecha_evento: fecha,
        precio_final: precio,
        nombre_cliente: nombre,
        client_primary_contact_name:  contactName,
        client_primary_contact_phone: contactPhone,
        client_primary_contact_email: contactEmail,
        client_notes: clientNotes,
      })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Error al guardar la reservación.');
      return;
    }
    cerrarModalReservacion();
    await cargarEstrategiaMesCompletoConIA(true);
  } catch (e) {
    alert('No se pudo conectar con el servidor.');
    console.error(e);
  } finally {
    btnConfirmar.disabled = false;
    btnConfirmar.innerText = '✔ Confirmar Reservación';
  }
}

async function eliminarReservacion() {
  if (!_modalReservaActiva) return;
  if (!confirm(`¿Cancelar la reservación #${_modalReservaActiva.id_reservation}?`)) return;

  const btnEliminar = document.querySelector('.btn-modal-eliminar');
  btnEliminar.disabled = true;

  try {
    const res = await fetch(`/api/reservaciones/${_modalReservaActiva.id_reservation}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      cerrarModalReservacion();
      await cargarEstrategiaMesCompletoConIA(true);
    } else {
      alert('Error al cancelar la reservación.');
    }
  } catch (e) {
    alert('No se pudo conectar con el servidor.');
  } finally {
    btnEliminar.disabled = false;
  }
}

// Cerrar modal al hacer clic fuera de la tarjeta
document.addEventListener('click', (e) => {
  const overlay = document.getElementById('modalReservacion');
  if (overlay && e.target === overlay) cerrarModalReservacion();
});

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('-translate-x-full');
  overlay.classList.toggle('hidden');
}

async function generarGraficaHistoricaOcupacion() {
  const chart = document.getElementById("chartBars");
  if (!chart) return;
  chart.innerHTML = "";
  const chartLabels = document.getElementById("chartLabels");
  if (chartLabels) chartLabels.innerHTML = "";

  // 1. Obtener todas las reservaciones reales
  let reservacionesReales = [];
  try {
    const res = await fetch('/api/reservaciones');
    if (res.ok) reservacionesReales = await res.json();
  } catch (e) {
    console.warn('Error al cargar datos para la gráfica', e);
  }

  const anioInicio = 2026;
  const anioFin = 2027;
  const mesesNombres = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  
  const chartData = [];

  for (let y = anioInicio; y <= anioFin; y++) {
    for (let m = 0; m < 12; m++) {
      const diasEnElMes = new Date(y, m + 1, 0).getDate();
      const reservacionesDelMes = reservacionesReales.filter(r => {
        if (!r.fecha_evento) return false;
        const [rYear, rMonth] = r.fecha_evento.split('-');
        return parseInt(rYear) === y && parseInt(rMonth) === (m + 1);
      }).length;

      const porcentaje = Math.round((reservacionesDelMes / diasEnElMes) * 100);

      // Solo agregar si es > 1%
      if (porcentaje > 1) {
        chartData.push({ mes: `${mesesNombres[m]} ${y.toString().slice(-2)}`, valor: porcentaje });
      }
    }
  }

  if (chartData.length === 0) {
    chart.innerHTML = "<p style='color:var(--text-muted); font-size:0.9rem; text-align:center; width:100%; margin-top:50px;'>No hay datos suficientes para mostrar.</p>";
    return;
  }

  // 🏆 LÓGICA DE ESCALADO RELATIVO
  // Encontramos el valor más alto en los datos actuales
  const maxValor = chartData.reduce((max, item) => Math.max(max, item.valor), 1);
  const maxBarHeight = 110; // Píxeles máximos de altura visual para la barra más grande

  // 2. DIBUJAR BARRAS DE FONDO (HTML fluidas)
  chartData.forEach(item => {
    const scaledHeight = (item.valor / maxValor) * maxBarHeight;

    const wrapper = document.createElement("div");
    wrapper.classList.add("chart-bar-wrapper");
    wrapper.innerHTML = `
      <div class="chart-value">${item.valor}%</div>
      <div class="chart-bar" style="height:${scaledHeight}px;"></div>
    `;
    chart.appendChild(wrapper);
  });

  // Etiquetas de mes en fila separada para que las barras toquen el fondo exacto
  if (chartLabels) {
    chartData.forEach(item => {
      const lbl = document.createElement("div");
      lbl.className = "chart-month";
      lbl.style.flex = "1";
      lbl.style.textAlign = "center";
      lbl.textContent = item.mes;
      chartLabels.appendChild(lbl);
    });
  }

}