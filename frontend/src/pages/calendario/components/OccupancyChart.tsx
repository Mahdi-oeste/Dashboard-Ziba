import { useMemo } from "react";
import type { ReservacionLista } from "../types";
import { NOMBRES_MESES_CORTOS } from "../semaforo";

interface OccupancyChartProps {
  reservaciones: ReservacionLista[];
}

interface BarraDato {
  mes: string;
  valor: number;
}

const ANIO_INICIO = 2026;
const ANIO_FIN = 2027;
const MAX_BAR_HEIGHT = 110; // px de la barra más alta (escalado relativo)

/**
 * Gráfica de ocupación 2026-2027. Migra generarGraficaHistoricaOcupacion():
 * la lógica de escalado relativo de barras (valor/maxValor * MAX_BAR_HEIGHT)
 * pasa de inyección imperativa de divs a un mapeo declarativo de React.
 */
export default function OccupancyChart({ reservaciones }: OccupancyChartProps) {
  const chartData = useMemo<BarraDato[]>(() => {
    const data: BarraDato[] = [];
    for (let y = ANIO_INICIO; y <= ANIO_FIN; y++) {
      for (let m = 0; m < 12; m++) {
        const diasEnElMes = new Date(y, m + 1, 0).getDate();
        const reservacionesDelMes = reservaciones.filter((r) => {
          if (!r.fecha_evento) return false;
          const [rYear, rMonth] = r.fecha_evento.split("-");
          return parseInt(rYear) === y && parseInt(rMonth) === m + 1;
        }).length;

        const porcentaje = Math.round((reservacionesDelMes / diasEnElMes) * 100);
        if (porcentaje > 1) {
          data.push({
            mes: `${NOMBRES_MESES_CORTOS[m]} ${y.toString().slice(-2)}`,
            valor: porcentaje,
          });
        }
      }
    }
    return data;
  }, [reservaciones]);

  const maxValor = useMemo(
    () => chartData.reduce((max, item) => Math.max(max, item.valor), 1),
    [chartData],
  );

  return (
    <div
      className="card bg-white rounded-[18px] border border-gray-100 p-6 flex flex-col flex-1"
      style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}
    >
      <h2 className="text-[18.66px] font-bold text-black mb-5">
        Ocupación 2026-2027
      </h2>

      {chartData.length === 0 ? (
        <p className="text-[0.9rem] text-center w-full mt-[50px] text-[var(--text-muted)]">
          No hay datos suficientes para mostrar.
        </p>
      ) : (
        <>
          <div className="chart-bars">
            {chartData.map((item) => (
              <div className="chart-bar-wrapper" key={item.mes}>
                <div className="chart-value">{item.valor}%</div>
                <div
                  className="chart-bar"
                  style={{ height: `${(item.valor / maxValor) * MAX_BAR_HEIGHT}px` }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1.5">
            {chartData.map((item) => (
              <div className="chart-month" key={`lbl-${item.mes}`}>
                {item.mes}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
