/* ==========================================================================
 *  api.ts — Cliente HTTP unificado para la vista Calendario.
 *
 *  Sustituye las llamadas `fetch("/api/...")` dispersas de script.js por un
 *  cliente único cuya base se lee de variables de entorno (Vite). En ziba-front
 *  define VITE_API_BASE (ej. "https://api.oeste.mx" o "/api"). Si no existe,
 *  cae a "/api" para mantener compatibilidad con el nginx.conf actual.
 * ========================================================================== */
import type {
  EstrategiaData,
  PesosUsuarioResponse,
  PeriodoEspecial,
  PeriodoEspecialPayload,
  PesoKey,
  NivelPeso,
  NivelEstacional,
  ReservacionLista,
  ReservacionDetalle,
  NuevaReservacionPayload,
  EditarReservacionPayload,
} from "./types";

const API_BASE: string = import.meta.env.VITE_API_BASE ?? "/api";

/** Wrapper genérico con manejo de errores homogéneo. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detalle = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) detalle = body.error;
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    throw new Error(detalle);
  }
  // 204 / cuerpos vacíos
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/* --------------------------------------------------------------------------
 *  ESTRATEGIA (consulta maestra del mes)
 * -------------------------------------------------------------------------- */
export function getEstrategia(
  fechaInicio: string,
  fechaFin: string,
): Promise<EstrategiaData> {
  return request<EstrategiaData>(
    `/estrategia?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`,
  );
}

/* --------------------------------------------------------------------------
 *  PESOS DEL USUARIO (tabla Importancia)
 * -------------------------------------------------------------------------- */
export function getPesosUsuario(): Promise<PesosUsuarioResponse> {
  return request<PesosUsuarioResponse>("/pesos-usuario");
}

export function updatePesoUsuario(
  key: PesoKey,
  value: NivelPeso,
): Promise<{ status: string }> {
  return request("/pesos-usuario", {
    method: "PUT",
    body: JSON.stringify({ key, value }),
  });
}

/* --------------------------------------------------------------------------
 *  PONDERACIONES POR DÍA / MES
 * -------------------------------------------------------------------------- */
export function updatePonderacionDia(
  idDay: number,
  pondDayUser: NivelPeso,
): Promise<{ status: string }> {
  return request("/actualizar-ponderacion-dia", {
    method: "PUT",
    body: JSON.stringify({ id_day: idDay, pond_day_user: pondDayUser }),
  });
}

export function updatePonderacionMes(
  idMonth: number,
  pondMonthUser: NivelEstacional,
): Promise<{ status: string }> {
  return request("/actualizar-ponderacion-mes", {
    method: "PUT",
    body: JSON.stringify({ id_month: idMonth, pond_month_user: pondMonthUser }),
  });
}

/* --------------------------------------------------------------------------
 *  PERIODOS / FECHAS ESPECIALES (CRUD)
 * -------------------------------------------------------------------------- */
export function getPeriodosEspeciales(): Promise<PeriodoEspecial[]> {
  return request<PeriodoEspecial[]>("/periodos-especiales");
}

export function createPeriodoEspecial(
  payload: PeriodoEspecialPayload,
): Promise<PeriodoEspecial> {
  return request<PeriodoEspecial>("/periodos-especiales", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updatePeriodoEspecial(
  id: number,
  payload: PeriodoEspecialPayload,
): Promise<unknown> {
  return request(`/periodos-especiales/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deletePeriodoEspecial(id: number): Promise<unknown> {
  return request(`/periodos-especiales/${id}`, { method: "DELETE" });
}

/* --------------------------------------------------------------------------
 *  RESERVACIONES
 * -------------------------------------------------------------------------- */
export function getReservaciones(): Promise<ReservacionLista[]> {
  return request<ReservacionLista[]>("/reservaciones");
}

export function getReservacion(id: number): Promise<ReservacionDetalle> {
  return request<ReservacionDetalle>(`/reservaciones/${id}`);
}

export function createReservacion(
  payload: NuevaReservacionPayload,
): Promise<unknown> {
  return request("/reservaciones", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateReservacion(
  id: number,
  payload: EditarReservacionPayload,
): Promise<unknown> {
  return request(`/reservaciones/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteReservacion(id: number): Promise<unknown> {
  return request(`/reservaciones/${id}`, { method: "DELETE" });
}

/* --------------------------------------------------------------------------
 *  SSE — stream de eventos del backend (/eventos)
 *  Devuelve la instancia para que el caller la cierre en el cleanup del effect.
 * -------------------------------------------------------------------------- */
export function abrirEventStream(): EventSource {
  return new EventSource(`${API_BASE}/eventos`);
}

/* --------------------------------------------------------------------------
 *  PONDERACIONES IA — actualización en lote
 * -------------------------------------------------------------------------- */
export function updatePonderacionDiasIA(
  dias: Record<number, NivelPeso>,
): Promise<{ status: string }> {
  return request('/actualizar-ponderacion-dias-ia', {
    method: 'PUT',
    body: JSON.stringify({ dias }),
  });
}

export function updatePonderacionMesesIA(
  meses: Record<number, NivelEstacional>,
): Promise<{ status: string }> {
  return request('/actualizar-ponderacion-meses-ia', {
    method: 'PUT',
    body: JSON.stringify({ meses }),
  });
}

/* --------------------------------------------------------------------------
 *  GEMINI IA
 * -------------------------------------------------------------------------- */
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent';

function extraerJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return match ? match[1].trim() : text.trim();
}

export async function llamarGemini(prompt: string): Promise<string> {
  if (!GEMINI_KEY) throw new Error('VITE_GEMINI_API_KEY no configurada');
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json();
  return extraerJSON(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
}

export const PROMPT_DIAS = `Eres un asistente de análisis de demanda para Jardín Zibá, un venue de bodas y eventos sociales en México.

Sugiere el nivel de demanda esperado para cada día de la semana.

Reglas:
- Usa EXACTAMENTE uno de: "Muy alto", "Alto", "Medio", "Bajo", "Muy bajo"

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{"dias": {"0":"...","1":"...","2":"...","3":"...","4":"...","5":"...","6":"..."}}

Días: 0=Domingo 1=Lunes 2=Martes 3=Miércoles 4=Jueves 5=Viernes 6=Sábado`;

export const PROMPT_MESES = `Eres un asistente de análisis de demanda para Jardín Zibá, un venue de bodas y eventos sociales en México.

Sugiere el nivel de demanda esperado para cada mes del año.

Reglas:
- Usa EXACTAMENTE uno de: "Muy alta", "Alta", "Media", "Baja", "Muy baja"

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{"meses": {"1":"...","2":"...","3":"...","4":"...","5":"...","6":"...","7":"...","8":"...","9":"...","10":"...","11":"...","12":"..."}}

Meses: 1=Enero 2=Febrero 3=Marzo 4=Abril 5=Mayo 6=Junio 7=Julio 8=Agosto 9=Septiembre 10=Octubre 11=Noviembre 12=Diciembre`;

export const PROMPT_FECHAS = `Eres un asistente de análisis de demanda para Jardín Zibá, un venue de bodas y eventos sociales en México.

Sugiere el nivel de demanda esperado para cada fecha especial listada.

Reglas:
- Usa EXACTAMENTE uno de: "Muy alto", "Alto", "Medio", "Bajo", "Muy bajo"

Fechas especiales a evaluar:
{{FECHAS}}

Responde ÚNICAMENTE con JSON válido, usando el ID numérico como clave, sin texto adicional:
{"fechas": {"<id>":"...", ...}}`;

export const PROMPT_IMPORTANCIA = `Eres un asistente de análisis de demanda para Jardín Zibá, un venue de bodas y eventos sociales en México.

Sugiere la importancia relativa de cada factor al determinar el precio de un evento.

Factores:
- dias: El día de la semana (ej. sábado vs lunes tiene gran diferencia en demanda)
- mes: El mes del año (temporada alta de bodas vs temporada baja)
- fechas_especiales: Proximidad a fechas especiales como feriados o temporadas
- fechas_reservadas: Disponibilidad del venue (fechas ya reservadas alrededor)

Reglas:
- Usa EXACTAMENTE uno de: "Muy alto", "Alto", "Medio", "Bajo", "Muy bajo"

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{"importancia": {"dias":"...","mes":"...","fechas_especiales":"...","fechas_reservadas":"..."}}`;

export function updatePesosIA(
  importancia: Partial<Record<'dias' | 'mes' | 'fechas_especiales' | 'fechas_reservadas', NivelPeso>>,
): Promise<{ status: string }> {
  return request('/pesos-usuario-ia', {
    method: 'PUT',
    body: JSON.stringify({ importancia }),
  });
}
