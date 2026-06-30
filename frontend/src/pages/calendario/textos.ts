/* ==========================================================================
 *  textos.ts — Todos los textos visibles al usuario del módulo Calendario.
 *  Etiquetas, títulos, placeholders, tooltips y mensajes centralizados aquí.
 *  Importar desde aquí en lugar de hardcodear strings en los componentes.
 * ========================================================================== */
import type { PesoKey } from "./types";

/* ---------- Compartidos --------------------------------------------------- */
export const TXT_COL_USUARIO = "Usuario";
export const TXT_COL_IA = "IA";
export const TXT_MXN = "MXN";
export const TXT_MN = "M.N.";
export const TXT_BTN_IA_SYNC = "Aplicar valores de IA a Usuario";
export const TXT_BTN_IA_GENERATE = "Generar sugerencias IA";

/* ---------- CalendarGrid -------------------------------------------------- */
export const CABECERAS_SEMANA = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

export const TXT_GRID_PRECIO_USUARIO = "Usuario:";
export const TXT_GRID_PRECIO_IA = "IA:";
export const TXT_LEYENDA_DISPONIBLE = "Fecha Disponible";
export const TXT_LEYENDA_RESERVADA = "Fecha Reservada";
export const TXT_LEYENDA_PRECIO_CALC = "Precio Calculado";
export const TXT_LEYENDA_PRECIO_SUG = "Precio Sugerido";
export const TXT_LEYENDA_PERI_EVENTO = "Pre/Post evento";

/* ---------- OccupancyChart ------------------------------------------------ */
export const TXT_CHART_TITULO = "Ocupación 2026-2027";
export const TXT_CHART_VACIO = "No hay datos suficientes para mostrar.";

/* ---------- ImportanceTable ----------------------------------------------- */
export const TXT_IMPORTANCIA_TITULO = "Importancia";
export const TXT_IMPORTANCIA_COL_POND = "Ponderación";
export const FILAS_IMPORTANCIA: { key: PesoKey; label: string }[] = [
  { key: "dias", label: "Día" },
  { key: "mes", label: "Mes" },
  { key: "fechas_especiales", label: "Fechas Especiales" },
  { key: "fechas_reservadas", label: "Reservas" },
];

/* ---------- PonderationTables --------------------------------------------- */
export const TXT_POND_DIA_TITULO = "Ponderación por Día";
export const TXT_POND_MES_TITULO = "Ponderación por Mes";
export const TXT_POND_FECHAS_TITULO = "Ponderación de Fechas Especiales";
export const TXT_COL_DIA = "Día";
export const TXT_COL_MES = "Mes";
export const TXT_COL_NOMBRE_RANGO = "Nombre / Rango de Fechas";
export const TXT_FECHAS_PH_NOMBRE = "Nombre del periodo";
export const TXT_FECHAS_SEPARADOR = "al";
export const TXT_FECHAS_BTN_AGREGAR = "Agregar periodo";
export const TXT_FECHAS_BTN_ELIMINAR = "Eliminar periodo";

/* ---------- ReservationModal ---------------------------------------------- */
export const TXT_MODAL_TITULO_ADD = "Nueva Reservación";
export const TXT_MODAL_TITULO_DETAIL = "Reservación Confirmada";
export const TXT_MODAL_ARIA_CERRAR = "Cerrar";

export const TXT_MODAL_LABEL_CLIENTE_ADD = "Nombre del cliente";
export const TXT_MODAL_LABEL_PRECIO_FINAL = "Precio final";
export const TXT_MODAL_LABEL_PRECIO_SUG_IA = "Precio sugerido IA";
export const TXT_MODAL_LABEL_CONTACTO_ADD = "Nombre contacto principal";
export const TXT_MODAL_LABEL_TEL_ADD = "Teléfono contacto principal";
export const TXT_MODAL_LABEL_EMAIL_ADD = "Email contacto principal";
export const TXT_MODAL_LABEL_NOTAS = "Notas";
export const TXT_MODAL_LABEL_INICIO_PRE = "Reservación pre-evento";
export const TXT_MODAL_LABEL_PRECIO_PRE = "Precio pre-evento";
export const TXT_MODAL_LABEL_FIN_POST = "Reservación post-evento";
export const TXT_MODAL_LABEL_PRECIO_POST = "Precio post-evento";

export const TXT_MODAL_LABEL_CLIENTE_DETAIL = "Cliente";
export const TXT_MODAL_LABEL_CONTACTO_DETAIL = "Contacto principal";
export const TXT_MODAL_LABEL_TEL_DETAIL = "Teléfono";
export const TXT_MODAL_LABEL_EMAIL_DETAIL = "Email";

export const TXT_MODAL_PH_CLIENTE_ADD = "Familia Villas";
export const TXT_MODAL_PH_CONTACTO = "Diego Villas";
export const TXT_MODAL_PH_TEL = "+52 55 1234 5678";
export const TXT_MODAL_PH_EMAIL_ADD = "correo@ejemplo.com";
export const TXT_MODAL_PH_NOTAS = "Observaciones opcionales";
export const TXT_MODAL_PH_CLIENTE_DETAIL = "Nombre del cliente";
export const TXT_MODAL_PH_CONTACTO_DETAIL = "Nombre del contacto";
export const TXT_MODAL_PH_EMAIL_DETAIL = "correo@ejemplo.com";

export const TXT_MODAL_ROW_ID = "ID";
export const TXT_MODAL_ROW_REGISTRADA = "Registrada";
export const TXT_MODAL_CARGANDO = "Cargando datos...";
export const TXT_MODAL_GUARDANDO = "Guardando...";

export const TXT_MODAL_BTN_CANCELAR = "Cancelar";
export const TXT_MODAL_BTN_CERRAR = "Cerrar";
export const TXT_MODAL_BTN_CONFIRMAR = "Confirmar Reservación";
export const TXT_MODAL_BTN_GUARDAR = "Guardar";
export const TXT_MODAL_BTN_CANCELAR_RES = "Cancelar Reservación";

export const TXT_MODAL_ALERT_PRECIO = "Por favor ingresa un precio válido.";
export const TXT_MODAL_ALERT_PRE_DATE = "La fecha de inicio pre-evento no puede ser posterior a la fecha del evento.";
export const TXT_MODAL_ALERT_POST_DATE = "La fecha de reservación post-evento no puede ser anterior a la fecha del evento.";
export const TXT_MODAL_ALERT_PRE_DATE_OCUPADA = "La fecha de reservación pre-evento ya tiene una reservación confirmada.";
export const TXT_MODAL_ALERT_POST_DATE_OCUPADA = "La fecha de fin post-evento ya tiene una reservación confirmada.";
export const TXT_MODAL_CONFIRM_CANCELAR = (id: number | null): string =>
  `¿Cancelar la reservación #${id}?`;
export const TXT_MODAL_CLIENTE_DEFECTO = "Cliente Gala";

/* ---------- CalendarDashboard --------------------------------------------- */
export const TXT_KPI_OCUPACION = "Porcentaje De Ocupación 2026-2027";
export const TXT_KPI_TOTAL = "Reservaciones Totales 2026-2027";
export const TXT_KPI_RANGO = "Rango de Tarifas 2026-2027";
export const TXT_KPI_INGRESOS = "Ingresos Totales 2026-2027";
