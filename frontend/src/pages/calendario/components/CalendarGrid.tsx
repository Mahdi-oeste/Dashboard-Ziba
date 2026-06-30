import { useMemo, type CSSProperties } from "react";
import type { ClaseSemaforo, EstrategiaData, Reservacion, ReservacionPeri } from "../types";
import { calcularColorGradiente, claseSemaforo } from "../semaforo";
import {
  CABECERAS_SEMANA,
  TXT_GRID_PRECIO_USUARIO,
  TXT_GRID_PRECIO_IA,
  TXT_LEYENDA_DISPONIBLE,
  TXT_LEYENDA_RESERVADA,
  TXT_LEYENDA_PRECIO_CALC,
  TXT_LEYENDA_PRECIO_SUG,
  TXT_LEYENDA_PERI_EVENTO,
} from "../textos";

interface CalendarGridProps {
  anio: number;
  mes: number; // 0-11
  estrategia: EstrategiaData | null;
  hoy: Date;
  onSelectLibre: (fecha: string, precioFinal: number, precioIA: number) => void;
  onSelectOcupado: (reserva: Reservacion) => void;
}

const PRECIO_DEFECTO = 400000;

const CLASE_A_T: Record<ClaseSemaforo, number> = {
  "very-high": 0,
  high: 0.25,
  medio: 0.5,
  low: 0.75,
  "very-low": 1,
};

interface CeldaDia {
  dia: number;
  fechaIso: string;
  ocupado: boolean;
  periEvento: boolean;
  reserva: Reservacion | null;
  precioSugeridoIa: number;
  precioComputado: number | null;
  esHoy: boolean;
  styleVars: CSSProperties;
  labelUsuario: string;
  labelUsuarioPeri: string;
  labelIA: string;
}

function fmtK(price: number) {
  return "$" + (price / 1000).toFixed(0) + "k";
}

export default function CalendarGrid({
  anio,
  mes,
  estrategia,
  hoy,
  onSelectLibre,
  onSelectOcupado,
}: CalendarGridProps) {
  const { celdasVacias, celdas } = useMemo(() => {
    const diaJS = new Date(anio, mes, 1).getDay();
    const vacias = diaJS === 0 ? 6 : diaJS - 1;
    const totalDiasMes = new Date(anio, mes + 1, 0).getDate();
    const stringMes = String(mes + 1).padStart(2, "0");

    const lista: CeldaDia[] = [];
    for (let d = 1; d <= totalDiasMes; d++) {
      const fechaIso = `${anio}-${stringMes}-${String(d).padStart(2, "0")}`;
      const reserva = estrategia?.reservaciones_periodo?.[fechaIso] ?? null;
      const periReserva: ReservacionPeri | null =
        estrategia?.fechas_peri_evento?.[fechaIso] ?? null;
      const ocupado = !!reserva;
      const periEvento = !ocupado && !!periReserva;

      const precioSugeridoIa =
        estrategia?.precios_sugeridos_calendario?.[fechaIso] ?? PRECIO_DEFECTO;
      const precioComputado =
        estrategia?.precios_computados_calendario?.[fechaIso] ?? null;

      const styleVars: Record<string, string> = {};
      if (!ocupado && !periEvento) {
        const dow = new Date(fechaIso + "T00:00:00").getDay();
        const claseUser = claseSemaforo(estrategia?.ponderacion_dias_user?.[dow]);
        const { bg, border, text } = calcularColorGradiente(CLASE_A_T[claseUser]);
        styleVars["--cal-libre-bg"] = bg;
        styleVars["--cal-libre-border"] = border;
        styleVars["--cal-libre-text"] = text;
        styleVars["--cal-user-price"] = text;

        const claseIa = claseSemaforo(estrategia?.ponderacion_dias_ia?.[dow]);
        const { iaText } = calcularColorGradiente(CLASE_A_T[claseIa]);
        styleVars["--cal-ia-price"] = iaText;
      }

      const esHoy =
        d === hoy.getDate() &&
        mes === hoy.getMonth() &&
        anio === hoy.getFullYear();

      // Price for peri cells: pre_price when before event, post_price when after.
      let precioPeri: number | null = null;
      if (periEvento && periReserva) {
        const raw =
          fechaIso < periReserva.fecha ? periReserva.pre_price : periReserva.post_price;
        precioPeri = raw != null ? Number(raw) : null;
      }

      lista.push({
        dia: d,
        fechaIso,
        ocupado,
        periEvento,
        reserva: reserva ?? periReserva,
        precioSugeridoIa,
        precioComputado,
        esHoy,
        styleVars: styleVars as CSSProperties,
        labelUsuario: precioComputado !== null ? fmtK(precioComputado) : "—",
        labelUsuarioPeri: precioPeri !== null ? fmtK(precioPeri) : "—",
        labelIA: fmtK(precioSugeridoIa),
      });
    }
    return { celdasVacias: vacias, celdas: lista };
  }, [anio, mes, estrategia, hoy]);

  return (
    <>
      <div className="single-calendar-container">
        {CABECERAS_SEMANA.map((d) => (
          <div className="day-name-header" key={d}>
            {d}
          </div>
        ))}

        {Array.from({ length: celdasVacias }).map((_, i) => (
          <div className="calendar-wrapper-empty" key={`empty-${i}`} />
        ))}

        {celdas.map((c) => (
          <div
            key={c.fechaIso}
            className={`day ${c.ocupado ? "ocupado" : c.periEvento ? "peri-evento" : "libre"}${c.esHoy ? " today" : ""}`}
            style={c.styleVars}
            onClick={() =>
              (c.ocupado || c.periEvento) && c.reserva
                ? onSelectOcupado(c.reserva)
                : onSelectLibre(
                    c.fechaIso,
                    c.precioComputado ?? c.precioSugeridoIa,
                    c.precioSugeridoIa,
                  )
            }
          >
            <span className="day-number">{c.dia}</span>
            <div className="day-prices-container">
              <div className="price-row user-price">
                <span>{TXT_GRID_PRECIO_USUARIO}</span>
                {c.periEvento ? c.labelUsuarioPeri : c.labelUsuario}
              </div>
              <div className="price-row ia-price">
                <span>{TXT_GRID_PRECIO_IA}</span>
                {c.labelIA}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Leyenda />
    </>
  );
}

function Leyenda() {
  return (
    <div className="legend">
      <div className="legend-item">
        <div className="legend-chip legend-chip-libre" />
        <span>{TXT_LEYENDA_DISPONIBLE}</span>
      </div>
      <div className="legend-item">
        <div
          className="legend-chip"
          style={{
            background: "var(--cal-ocupado-bg)",
            border: "1px solid var(--cal-ocupado-border)",
          }}
        />
        <span>{TXT_LEYENDA_RESERVADA}</span>
      </div>
      <div className="legend-item">
        <div
          className="legend-chip"
          style={{
            background: "var(--cal-peri-bg)",
            border: "1px solid var(--cal-peri-border)",
          }}
        />
        <span>{TXT_LEYENDA_PERI_EVENTO}</span>
      </div>
      <div className="legend-item legend-separator">
        <span className="legend-label-user">{TXT_GRID_PRECIO_USUARIO}</span>
        <span>{TXT_LEYENDA_PRECIO_CALC}</span>
      </div>
      <div className="legend-item">
        <span className="legend-label-ia">{TXT_GRID_PRECIO_IA}</span>
        <span>{TXT_LEYENDA_PRECIO_SUG}</span>
      </div>
    </div>
  );
}
