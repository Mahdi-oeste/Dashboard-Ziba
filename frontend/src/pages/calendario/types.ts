/* ==========================================================================
 *  types.ts — Tipado estricto de la vista Calendario (migración de script.js)
 *  Las formas reflejan el contrato real del backend (server.js).
 * ========================================================================== */

/** Niveles del semáforo en su forma "masculina" (días, fechas, pesos del usuario). */
export type NivelPeso = "Muy alto" | "Alto" | "Medio" | "Bajo" | "Muy bajo";

/** Niveles del semáforo en su forma "femenina" (estacionalidad de meses). */
export type NivelEstacional = "Muy alta" | "Alta" | "Media" | "Baja" | "Muy baja";

/** Clase CSS de semáforo aplicada a selects y badges. */
export type ClaseSemaforo = "very-high" | "high" | "medio" | "low" | "very-low";

/** Reservación tal como llega embebida en `reservaciones_periodo` de /estrategia. */
export interface Reservacion {
  id_reservation: number;
  fecha: string; // ISO YYYY-MM-DD
  precio_final: number | string;
  nombre_cliente: string;
}

/** Reservación embebida en `fechas_peri_evento` de /estrategia. */
export interface ReservacionPeri extends Reservacion {
  pre_price: number | string | null;
  post_price: number | string | null;
}

/** Reservación completa devuelta por GET /reservaciones/:id. */
export interface ReservacionDetalle {
  id_reservation: number;
  fecha_evento: string;
  precio_final: number | string | null;
  estatus: string;
  nombre_cliente: string;
  fecha_registro: string;
  fecha_edicion: string;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  notas: string | null;
  pre_start_date: string | null;
  pre_price: number | string | null;
  post_end_date: string | null;
  post_price: number | string | null;
}

/** Reservación de la lista global GET /reservaciones (usada por KPIs y gráfica). */
export interface ReservacionLista {
  id_reservation: number;
  fecha_evento: string;
  precio_final: number | string | null;
  estatus: string;
  nombre_cliente: string;
}

/** Estado de la tabla "Importancia" (pesos del usuario). */
export interface PesosUsuario {
  dias: NivelPeso;
  mes: NivelPeso;
  fechas_especiales: NivelPeso;
  fechas_reservadas: NivelPeso;
}

/** Respuesta de GET /pesos-usuario: incluye los valores IA. */
export interface PesosUsuarioResponse extends Partial<PesosUsuario> {
  dias_ia?: NivelPeso;
  mes_ia?: NivelPeso;
  fechas_especiales_ia?: NivelPeso;
  fechas_reservadas_ia?: NivelPeso;
}

/** Clave persistible de la tabla Importancia (las soportadas por el PUT). */
export type PesoKey = keyof PesosUsuario;

/** Respuesta maestra de GET /estrategia. */
export interface EstrategiaData {
  precios_sugeridos_calendario: Record<string, number>;
  precios_computados_calendario: Record<string, number>;
  reservaciones_periodo: Record<string, Reservacion>;
  fechas_peri_evento?: Record<string, ReservacionPeri>;
  ponderacion_dias_user: Record<number, NivelPeso>;
  ponderacion_dias_ia: Record<number, NivelPeso>;
  estacionalidad_meses_completo_user: Record<number, NivelEstacional>;
  estacionalidad_meses_completo_ia: Record<number, NivelEstacional>;
  estacionalidad_periodo_user: NivelEstacional;
  estacionalidad_periodo_ia: NivelEstacional;
}

/** Periodo / fecha especial (CRUD). */
export interface PeriodoEspecial {
  id: number;
  nombre: string;
  fecha_inicio: string; // ISO YYYY-MM-DD
  fecha_fin: string; // ISO YYYY-MM-DD
  pond_user: NivelPeso;
  pond_ia: NivelPeso;
}

/** Payload de creación/actualización de un periodo especial. */
export interface PeriodoEspecialPayload {
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  pond_user: NivelPeso;
  pond_ia?: NivelPeso;
}

/** Payload de alta de reservación (POST /reservaciones). */
export interface NuevaReservacionPayload {
  fecha_evento: string;
  precio_final: number;
  nombre_cliente: string;
  client_primary_contact_name: string | null;
  client_primary_contact_phone: string | null;
  client_primary_contact_email: string | null;
  client_notes: string | null;
  pre_start_date?: string | null;
  pre_price?: number | null;
  post_end_date?: string | null;
  post_price?: number | null;
}

/** Payload de edición de reservación (PUT /reservaciones/:id). */
export interface EditarReservacionPayload {
  nombre_cliente: string;
  precio_final: number | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  notas: string | null;
  pre_start_date?: string | null;
  pre_price?: number | null;
  post_end_date?: string | null;
  post_price?: number | null;
}

/** Colores interpolados devueltos por la utilidad de gradiente. */
export interface ColorGradiente {
  bg: string;
  border: string;
  text: string;
  iaText: string;
}

/** Estado controlado del modal unificado de reservación. */
export type ModalMode = "add" | "detail" | null;

export interface ModalState {
  mode: ModalMode;
  fecha: string | null;
  /** Precio sugerido (computed_price ?? ia_price) para precargar en modo "add". */
  precioSugerido: number;
  /** ia_price puro del calendario, mostrado en "Precio sugerido IA". */
  precioIA: number;
  /** Reservación seleccionada en modo "detail". */
  reserva: Reservacion | null;
}
