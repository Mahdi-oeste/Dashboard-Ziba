/* ==========================================================================
 *  semaforo.ts — Utilidad PURA del sistema de semáforo y gradiente de precios.
 *
 *  Migra `hexToHsl` y `calcularColorGradiente` de script.js. El original leía
 *  los stops con getComputedStyle(document.documentElement); aquí se declaran
 *  como constantes tipadas que ESPEJAN las variables --semaforo-* de
 *  calendario.css (única fuente de verdad documental). Esto hace la función
 *  pura, testeable y segura para SSR.
 *
 *  Mantiene intactos: la interpolación HSL, la inversión (1 - t) que hace el
 *  caller, y el "snap to nearest tier" para los colores de texto.
 * ========================================================================== */
import type {
  ClaseSemaforo,
  ColorGradiente,
  NivelPeso,
  NivelEstacional,
} from "./types";

/* --------------------------------------------------------------------------
 *  Mapeo nivel -> clase CSS de semáforo (acepta forma masculina y femenina).
 *  Equivale a `mapaClasesPesos` + `mapaClasesEstacionales` del original.
 * -------------------------------------------------------------------------- */
const MAPA_CLASES: Record<string, ClaseSemaforo> = {
  "Muy alto": "very-high",
  Alto: "high",
  Medio: "medio",
  Bajo: "low",
  "Muy bajo": "very-low",
  "Muy alta": "very-high",
  Alta: "high",
  Media: "medio",
  Baja: "low",
  "Muy baja": "very-low",
};

export function claseSemaforo(
  nivel: NivelPeso | NivelEstacional | string | null | undefined,
): ClaseSemaforo {
  return (nivel && MAPA_CLASES[nivel]) || "medio";
}

/* --------------------------------------------------------------------------
 *  hexToHsl — convierte #rrggbb a [H, S%, L%]. Copia fiel del original.
 * -------------------------------------------------------------------------- */
export function hexToHsl(hex: string): [number, number, number] {
  const clean = hex.trim().replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

/* --------------------------------------------------------------------------
 *  Stops del semáforo (ESPEJO de --semaforo-* en calendario.css).
 *  pos 0.00 = very-high (precio máximo); pos 1.00 = very-low (precio mínimo).
 * -------------------------------------------------------------------------- */
interface SemaforoStop {
  pos: number;
  bg: string;
  text: string;
  iaText: string;
}

const SEMAFORO_STOPS: SemaforoStop[] = [
  { pos: 0.0, bg: "#00BD23", text: "#002907", iaText: "#0D74FA" }, // very-high
  { pos: 0.25, bg: "#93C41F", text: "#293608", iaText: "#0266E8" }, // high
  { pos: 0.5, bg: "#F5D01B", text: "#3B3102", iaText: "#0266E8" }, // medio
  { pos: 0.75, bg: "#ED942D", text: "#FDF5EC", iaText: "#207EFA" }, // low
  { pos: 1.0, bg: "#CF2819", text: "#FDEEEC", iaText: "#358CFF" }, // very-low
];

/* --------------------------------------------------------------------------
 *  calcularColorGradiente — interpola bg/border y hace snap de text/iaText.
 *  t=0 -> very-high ; t=1 -> very-low. El caller invoca con (1 - t).
 * -------------------------------------------------------------------------- */
export function calcularColorGradiente(t: number): ColorGradiente {
  const stops = SEMAFORO_STOPS.map((stp) => ({
    pos: stp.pos,
    hsl: hexToHsl(stp.bg),
    text: stp.text,
    iaText: stp.iaText,
  }));

  const clamped = Math.max(0, Math.min(1, t));
  let i = 0;
  while (i < stops.length - 2 && clamped > stops[i + 1].pos) i++;

  const s0 = stops[i];
  const s1 = stops[i + 1];
  const [h0, sat0, l0] = s0.hsl;
  const [h1, sat1, l1] = s1.hsl;
  const lt = s1.pos === s0.pos ? 0 : (clamped - s0.pos) / (s1.pos - s0.pos);

  const h = h0 + (h1 - h0) * lt;
  const s = sat0 + (sat1 - sat0) * lt;
  const l = l0 + (l1 - l0) * lt;
  const nearestFirst = lt < 0.5;

  return {
    bg: `hsla(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%, 1)`,
    border: `hsla(${h.toFixed(1)}, ${Math.min(100, s + 15).toFixed(1)}%, ${Math.max(
      0,
      l - 12,
    ).toFixed(1)}%, 1)`,
    text: nearestFirst ? s0.text : s1.text,
    iaText: nearestFirst ? s0.iaText : s1.iaText,
  };
}

/* --------------------------------------------------------------------------
 *  Constantes de dominio reutilizadas por las tablas.
 * -------------------------------------------------------------------------- */
export const OPCIONES_PESO: NivelPeso[] = [
  "Muy alto",
  "Alto",
  "Medio",
  "Bajo",
  "Muy bajo",
];

export const OPCIONES_ESTACIONAL: NivelEstacional[] = [
  "Muy alta",
  "Alta",
  "Media",
  "Baja",
  "Muy baja",
];

export const NOMBRES_MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export const NOMBRES_MESES_CORTOS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export const NOMBRES_DIAS_COMPLETOS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

/** Orden de filas de la tabla "Ponderación por Día": Lun..Dom (índice JS getDay). */
export const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];

/** Respaldo analítico de estacionalidad mensual (índice 0 = Enero). */
export const DEMANDA_DEFECTO_MESES: NivelEstacional[] = [
  "Muy baja",
  "Baja",
  "Media",
  "Media",
  "Alta",
  "Alta",
  "Media",
  "Baja",
  "Muy baja",
  "Alta",
  "Muy alta",
  "Muy alta",
];
