import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import "./calendario.css";

import type {
  EstrategiaData,
  PesosUsuario,
  PesoKey,
  NivelPeso,
  NivelEstacional,
  PeriodoEspecial,
  ReservacionLista,
  Reservacion,
  ModalState,
  NuevaReservacionPayload,
  EditarReservacionPayload,
} from "./types";
import * as api from "./api";
import { NOMBRES_MESES } from "./semaforo";

import ImportanceTable from "./components/ImportanceTable";
import OccupancyChart from "./components/OccupancyChart";
import PonderationTables from "./components/PonderationTables";
import CalendarGrid from "./components/CalendarGrid";
import ReservationModal from "./components/ReservationModal";

const DIAS_PERIODO = 730; // 2026 + 2027
const ANIO_MIN = 2025;
const ANIO_MAX = 2030;
const PESO_DEFECTO: NivelPeso = "Medio";

const PESOS_INICIALES: PesosUsuario = {
  dias: PESO_DEFECTO,
  mes: PESO_DEFECTO,
  fechas_especiales: PESO_DEFECTO,
  fechas_reservadas: PESO_DEFECTO,
};

const MODAL_CERRADO: ModalState = {
  mode: null,
  fecha: null,
  precioSugerido: 0,
  precioIA: 0,
  reserva: null,
};

/**
 * Contenedor principal de la vista Calendario. Dueño del estado global de la
 * vista (mes/año, estrategia, pesos, periodos, reservaciones, modal) y de los
 * efectos: carga inicial, recarga por navegación y suscripción SSE con cleanup.
 */
export default function CalendarDashboard() {
  const hoy = useMemo(() => new Date(), []);

  const [anio, setAnio] = useState(2026);
  const [mes, setMes] = useState(() => new Date().getMonth());

  const [estrategia, setEstrategia] = useState<EstrategiaData | null>(null);
  const [pesos, setPesos] = useState<PesosUsuario>(PESOS_INICIALES);
  const [iaBadges, setIaBadges] = useState<Partial<Record<PesoKey, NivelPeso>>>({});
  const [periodos, setPeriodos] = useState<PeriodoEspecial[]>([]);
  const [reservaciones, setReservaciones] = useState<ReservacionLista[]>([]);

  const [modal, setModal] = useState<ModalState>(MODAL_CERRADO);
  const [periodoEliminandoId, setPeriodoEliminandoId] = useState<number | null>(null);
  const [loadingIA, setLoadingIA] = useState<Record<string, boolean>>({});

  /* ----------------------------------------------------------------------
   *  Cargadores de datos
   * ---------------------------------------------------------------------- */
  const cargarEstrategia = useCallback(async () => {
    const primerDia = `${anio}-${String(mes + 1).padStart(2, "0")}-01`;
    const ultimoDia = `${anio}-${String(mes + 1).padStart(2, "0")}-${new Date(
      anio,
      mes + 1,
      0,
    ).getDate()}`;
    try {
      const data = await api.getEstrategia(primerDia, ultimoDia);
      setEstrategia(data);
    } catch (err) {
      console.error("[ERROR] Error en la carga del periodo:", err);
    }
  }, [anio, mes]);

  const cargarPesos = useCallback(async () => {
    try {
      const data = await api.getPesosUsuario();
      setPesos((prev) => ({
        dias: data.dias ?? prev.dias,
        mes: data.mes ?? prev.mes,
        fechas_especiales: data.fechas_especiales ?? prev.fechas_especiales,
        fechas_reservadas: data.fechas_reservadas ?? prev.fechas_reservadas,
      }));
      setIaBadges({
        dias: data.dias_ia,
        mes: data.mes_ia,
        fechas_especiales: data.fechas_especiales_ia,
        fechas_reservadas: data.fechas_reservadas_ia,
      });
    } catch (err) {
      console.warn("ℹ️ No se pudieron cargar los pesos del usuario.", err);
    }
  }, []);

  const cargarPeriodos = useCallback(async () => {
    try {
      setPeriodos(await api.getPeriodosEspeciales());
    } catch (err) {
      console.warn("No se pudieron cargar los periodos especiales.", err);
      setPeriodos([]);
    }
  }, []);

  const cargarReservaciones = useCallback(async () => {
    try {
      setReservaciones(await api.getReservaciones());
    } catch (err) {
      console.warn("No se pudieron cargar las reservaciones globales.", err);
    }
  }, []);

  /* ----------------------------------------------------------------------
   *  Carga inicial (una vez autenticado).
   * ---------------------------------------------------------------------- */
  useEffect(() => {
    void cargarPesos();
    void cargarPeriodos();
    void cargarReservaciones();
  }, [cargarPesos, cargarPeriodos, cargarReservaciones]);

  /* ----------------------------------------------------------------------
   *  Recarga de la estrategia al cambiar mes/año.
   * ---------------------------------------------------------------------- */
  useEffect(() => {
    void cargarEstrategia();
  }, [cargarEstrategia]);

  /* ----------------------------------------------------------------------
   *  SSE — recarga calendario + KPIs cuando el backend recalcula precios.
   *  Inicializado en un useEffect con cleanup que cierra la conexión.
   * ---------------------------------------------------------------------- */
  useEffect(() => {
    const es = api.abrirEventStream();
    es.addEventListener("calendario_actualizado", () => {
      void cargarEstrategia();
      void cargarReservaciones();
    });
    es.onerror = () => console.warn("SSE: reconectando...");
    return () => es.close();
  }, [cargarEstrategia, cargarReservaciones]);

  /* ----------------------------------------------------------------------
   *  KPIs derivados (useMemo) — reemplaza cargarKPIs() imperativo.
   * ---------------------------------------------------------------------- */
  const fechasEventosOcupados = useMemo(
    () => new Set(reservaciones.map((r) => r.fecha_evento)),
    [reservaciones],
  );

  const kpis = useMemo(() => {
    const total = reservaciones.length;
    const ingresos = reservaciones.reduce(
      (sum, r) => sum + (parseFloat(String(r.precio_final)) || 0),
      0,
    );
    const ocupacion = ((total / DIAS_PERIODO) * 100).toFixed(1);
    const preciosValidos = reservaciones
      .map((r) => parseFloat(String(r.precio_final)))
      .filter((p) => !isNaN(p) && p > 0);
    const minTarifa = preciosValidos.length ? Math.min(...preciosValidos) : 0;
    const maxTarifa = preciosValidos.length ? Math.max(...preciosValidos) : 0;
    return {
      total,
      ocupacion,
      ingresos: ingresos.toLocaleString("es-MX", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      rango: `$${minTarifa.toLocaleString("es-MX")} - $${maxTarifa.toLocaleString("es-MX")}`,
    };
  }, [reservaciones]);

  /* ----------------------------------------------------------------------
   *  Navegación de mes / año.
   * ---------------------------------------------------------------------- */
  const navegarMes = (delta: number) => {
    setMes((m) => {
      let nuevoMes = m + delta;
      if (nuevoMes > 11) {
        nuevoMes = 0;
        setAnio((y) => Math.min(ANIO_MAX, y + 1));
      } else if (nuevoMes < 0) {
        nuevoMes = 11;
        setAnio((y) => Math.max(ANIO_MIN, y - 1));
      }
      return nuevoMes;
    });
  };
  const navegarAnio = (delta: number) =>
    setAnio((y) => Math.min(ANIO_MAX, Math.max(ANIO_MIN, y + delta)));

  /* ----------------------------------------------------------------------
   *  Handlers de ponderaciones (optimistas + persistencia + recarga).
   * ---------------------------------------------------------------------- */
  const handleChangePeso = async (key: PesoKey, value: NivelPeso) => {
    setPesos((prev) => ({ ...prev, [key]: value }));
    try {
      await api.updatePesoUsuario(key, value);
      await cargarEstrategia();
    } catch (err) {
      console.warn(`ℹ️ Peso registrado solo en memoria: ${key} -> ${value}`, err);
    }
  };

  const handleChangeDia = async (idDay: number, value: NivelPeso) => {
    setEstrategia((prev) =>
      prev
        ? {
            ...prev,
            ponderacion_dias_user: { ...prev.ponderacion_dias_user, [idDay]: value },
          }
        : prev,
    );
    try {
      await api.updatePonderacionDia(idDay, value);
      await cargarEstrategia();
    } catch (err) {
      console.error("Error al actualizar ponderación de día:", err);
    }
  };

  const handleChangeMes = async (idMonth: number, value: NivelEstacional) => {
    const idx = idMonth - 1;
    setEstrategia((prev) =>
      prev
        ? {
            ...prev,
            estacionalidad_meses_completo_user: {
              ...prev.estacionalidad_meses_completo_user,
              [idx]: value,
            },
            estacionalidad_meses_completo_ia: {
              ...prev.estacionalidad_meses_completo_ia,
              [idx]: value,
            },
          }
        : prev,
    );
    try {
      await api.updatePonderacionMes(idMonth, value);
      await cargarEstrategia();
    } catch (err) {
      console.error("Error al actualizar ponderación mensual:", err);
    }
  };

  /* ----------------------------------------------------------------------
   *  CRUD de periodos especiales. La persistencia de edición se debounce
   *  para no disparar un PUT por cada pulsación al escribir el nombre.
   * ---------------------------------------------------------------------- */
  const debounceRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const handleUpdatePeriodo = (periodo: PeriodoEspecial) => {
    setPeriodos((prev) => prev.map((p) => (p.id === periodo.id ? periodo : p)));
    const timers = debounceRef.current;
    const anterior = timers.get(periodo.id);
    if (anterior) clearTimeout(anterior);
    timers.set(
      periodo.id,
      setTimeout(() => {
        void api
          .updatePeriodoEspecial(periodo.id, {
            nombre: periodo.nombre,
            fecha_inicio: periodo.fecha_inicio,
            fecha_fin: periodo.fecha_fin,
            pond_user: periodo.pond_user,
            pond_ia: "Medio",
          })
          .catch((err) =>
            console.error("Error al actualizar período especial.", err),
          );
        timers.delete(periodo.id);
      }, 500),
    );
  };

  const handleAddPeriodo = async () => {
    const hoyIso = new Date().toISOString().split("T")[0];
    try {
      await api.createPeriodoEspecial({
        nombre: "",
        fecha_inicio: hoyIso,
        fecha_fin: hoyIso,
        pond_user: "Medio",
        pond_ia: "Medio",
      });
      await cargarPeriodos();
      void cargarEstrategia();
    } catch (err) {
      console.error("Error al agregar período especial.", err);
    }
  };

  const handleDeletePeriodo = async (id: number) => {
    setPeriodoEliminandoId(id);
    try {
      await api.deletePeriodoEspecial(id);
      await cargarPeriodos();
      await cargarEstrategia();
    } catch (err) {
      console.error("Error al eliminar período especial.", err);
    } finally {
      setPeriodoEliminandoId(null);
    }
  };

  /* ----------------------------------------------------------------------
   *  Modal de reservación.
   * ---------------------------------------------------------------------- */
  const abrirModalAgregar = (fecha: string, precioSugerido: number, precioIA: number) =>
    setModal({ mode: "add", fecha, precioSugerido, precioIA, reserva: null });

  const abrirModalDetalle = (reserva: Reservacion) =>
    setModal({ mode: "detail", fecha: reserva.fecha, precioSugerido: 0, precioIA: 0, reserva });

  const cerrarModal = () => setModal(MODAL_CERRADO);

  const onConfirmReserva = async (payload: NuevaReservacionPayload) => {
    try {
      await api.createReservacion(payload);
      cerrarModal();
      await Promise.all([cargarEstrategia(), cargarReservaciones()]);
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "No se pudo conectar con el servidor.",
      );
    }
  };

  const onSaveReserva = async (id: number, payload: EditarReservacionPayload) => {
    try {
      await api.updateReservacion(id, payload);
      cerrarModal();
      await Promise.all([cargarEstrategia(), cargarReservaciones()]);
    } catch (err) {
      alert("Error al guardar: " + (err instanceof Error ? err.message : err));
    }
  };

  const onDeleteReserva = async (id: number) => {
    try {
      await api.deleteReservacion(id);
      cerrarModal();
      await Promise.all([cargarEstrategia(), cargarReservaciones()]);
    } catch {
      alert("No se pudo conectar con el servidor.");
    }
  };

  /* ----------------------------------------------------------------------
   *  IA — sincronizar y generar sugerencias.
   * ---------------------------------------------------------------------- */
  const handleSyncDiasIA = async () => {
    setLoadingIA((prev) => ({ ...prev, sync_dias: true }));
    try {
      await Promise.all(
        Object.entries(estrategia?.ponderacion_dias_ia ?? {}).map(([idDay, value]) =>
          api.updatePonderacionDia(Number(idDay), value as import("./types").NivelPeso),
        ),
      );
      setEstrategia((prev) =>
        prev ? { ...prev, ponderacion_dias_user: { ...prev.ponderacion_dias_ia } } : prev,
      );
      await cargarEstrategia();
    } catch (err) {
      console.error("Error sincronizando días IA:", err);
    } finally {
      setLoadingIA((prev) => ({ ...prev, sync_dias: false }));
    }
  };

  const handleSyncMesesIA = async () => {
    setLoadingIA((prev) => ({ ...prev, sync_meses: true }));
    try {
      await Promise.all(
        Object.entries(estrategia?.estacionalidad_meses_completo_ia ?? {}).map(([idx, value]) =>
          api.updatePonderacionMes(
            Number(idx) + 1,
            value as import("./types").NivelEstacional,
          ),
        ),
      );
      setEstrategia((prev) =>
        prev
          ? {
              ...prev,
              estacionalidad_meses_completo_user: {
                ...prev.estacionalidad_meses_completo_ia,
              },
            }
          : prev,
      );
      await cargarEstrategia();
    } catch (err) {
      console.error("Error sincronizando meses IA:", err);
    } finally {
      setLoadingIA((prev) => ({ ...prev, sync_meses: false }));
    }
  };

  const handleSyncFechasIA = async () => {
    setLoadingIA((prev) => ({ ...prev, sync_fechas: true }));
    try {
      await Promise.all(
        periodos.map((p) =>
          api.updatePeriodoEspecial(p.id, {
            nombre: p.nombre,
            fecha_inicio: p.fecha_inicio,
            fecha_fin: p.fecha_fin,
            pond_user: p.pond_ia,
            pond_ia: p.pond_ia,
          }),
        ),
      );
      await cargarPeriodos();
      await cargarEstrategia();
    } catch (err) {
      console.error("Error sincronizando fechas especiales IA:", err);
    } finally {
      setLoadingIA((prev) => ({ ...prev, sync_fechas: false }));
    }
  };

  const handleGenerateDiasIA = async () => {
    setLoadingIA((prev) => ({ ...prev, generate_dias: true }));
    try {
      const text = await api.llamarGemini(api.PROMPT_DIAS);
      const json = JSON.parse(text) as { dias: Record<string, string> };
      const dias: Record<number, import("./types").NivelPeso> = {};
      for (const [key, val] of Object.entries(json.dias)) {
        dias[Number(key)] = val as import("./types").NivelPeso;
      }
      await api.updatePonderacionDiasIA(dias);
      await cargarEstrategia();
    } catch (err) {
      console.error("Error generando sugerencias de días:", err);
      alert("Error al generar sugerencias. Verifica la consola.");
    } finally {
      setLoadingIA((prev) => ({ ...prev, generate_dias: false }));
    }
  };

  const handleGenerateMesesIA = async () => {
    setLoadingIA((prev) => ({ ...prev, generate_meses: true }));
    try {
      const text = await api.llamarGemini(api.PROMPT_MESES);
      const json = JSON.parse(text) as { meses: Record<string, string> };
      const meses: Record<number, import("./types").NivelEstacional> = {};
      for (const [key, val] of Object.entries(json.meses)) {
        meses[Number(key)] = val as import("./types").NivelEstacional;
      }
      await api.updatePonderacionMesesIA(meses);
      await cargarEstrategia();
    } catch (err) {
      console.error("Error generando sugerencias de meses:", err);
      alert("Error al generar sugerencias. Verifica la consola.");
    } finally {
      setLoadingIA((prev) => ({ ...prev, generate_meses: false }));
    }
  };

  const handleSyncImportanciaIA = async () => {
    setLoadingIA((prev) => ({ ...prev, sync_importancia: true }));
    try {
      await Promise.all(
        (["dias", "mes", "fechas_especiales", "fechas_reservadas"] as PesoKey[])
          .filter((key) => iaBadges[key] != null)
          .map((key) => handleChangePeso(key, iaBadges[key]!)),
      );
    } catch (err) {
      console.error("Error sincronizando importancia IA:", err);
    } finally {
      setLoadingIA((prev) => ({ ...prev, sync_importancia: false }));
    }
  };

  const handleGenerateImportanciaIA = async () => {
    setLoadingIA((prev) => ({ ...prev, generate_importancia: true }));
    try {
      const text = await api.llamarGemini(api.PROMPT_IMPORTANCIA);
      const json = JSON.parse(text) as {
        importancia: Record<string, string>;
      };
      await api.updatePesosIA(
        json.importancia as Partial<
          Record<"dias" | "mes" | "fechas_especiales" | "fechas_reservadas", import("./types").NivelPeso>
        >,
      );
      await cargarPesos();
    } catch (err) {
      console.error("Error generando sugerencias de importancia:", err);
      alert("Error al generar sugerencias. Verifica la consola.");
    } finally {
      setLoadingIA((prev) => ({ ...prev, generate_importancia: false }));
    }
  };

  const handleGenerateFechasIA = async () => {
    if (!periodos.length) return;
    setLoadingIA((prev) => ({ ...prev, generate_fechas: true }));
    try {
      const listaFechas = periodos
        .map((p) => `ID:${p.id} - ${p.nombre} (${p.fecha_inicio} al ${p.fecha_fin})`)
        .join("\n");
      const prompt = api.PROMPT_FECHAS.replace("{{FECHAS}}", listaFechas);
      const text = await api.llamarGemini(prompt);
      const json = JSON.parse(text) as { fechas: Record<string, string> };
      await Promise.all(
        periodos.map((p) => {
          const nuevaIA = json.fechas?.[String(p.id)] as
            | import("./types").NivelPeso
            | undefined;
          if (!nuevaIA) return Promise.resolve();
          return api.updatePeriodoEspecial(p.id, {
            nombre: p.nombre,
            fecha_inicio: p.fecha_inicio,
            fecha_fin: p.fecha_fin,
            pond_user: p.pond_user,
            pond_ia: nuevaIA,
          });
        }),
      );
      await cargarPeriodos();
      await cargarEstrategia();
    } catch (err) {
      console.error("Error generando sugerencias de fechas especiales:", err);
      alert("Error al generar sugerencias. Verifica la consola.");
    } finally {
      setLoadingIA((prev) => ({ ...prev, generate_fechas: false }));
    }
  };

  /* ----------------------------------------------------------------------
   *  Render.
   * ---------------------------------------------------------------------- */
  return (
    <div className="ziba-calendario">
      <div className="flex flex-col gap-8">
        {/* Importancia + Gráfica */}
        <section className="flex flex-col lg:flex-row gap-6 items-stretch">
          <ImportanceTable
            pesos={pesos}
            iaBadges={iaBadges}
            onChange={handleChangePeso}
            loadingIA={loadingIA}
            onSyncIA={handleSyncImportanciaIA}
            onGenerateIA={handleGenerateImportanciaIA}
          />
          <div className="flex flex-col gap-6 flex-1">
            <KpiCard
              titulo="Ingresos Totales 2026-2027"
              valor={<>${kpis.ingresos} <span className="text-mn">M.N.</span></>}
            />
            <OccupancyChart reservaciones={reservaciones} />
          </div>
        </section>

        {/* Tablas de ponderación */}
        <PonderationTables
          diasUser={estrategia?.ponderacion_dias_user ?? {}}
          diasIA={estrategia?.ponderacion_dias_ia ?? {}}
          mesesUser={estrategia?.estacionalidad_meses_completo_user ?? {}}
          mesesIA={estrategia?.estacionalidad_meses_completo_ia ?? {}}
          periodos={periodos}
          periodoEliminandoId={periodoEliminandoId}
          onChangeDia={handleChangeDia}
          onChangeMes={handleChangeMes}
          onUpdatePeriodo={handleUpdatePeriodo}
          onAddPeriodo={handleAddPeriodo}
          onDeletePeriodo={handleDeletePeriodo}
          loadingIA={loadingIA}
          onSyncDiasIA={handleSyncDiasIA}
          onSyncMesesIA={handleSyncMesesIA}
          onSyncFechasIA={handleSyncFechasIA}
          onGenerateDiasIA={handleGenerateDiasIA}
          onGenerateMesesIA={handleGenerateMesesIA}
          onGenerateFechasIA={handleGenerateFechasIA}
        />

        {/* KPIs */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <KpiCard titulo="Porcentaje De Ocupación 2026-2027" valor={`${kpis.ocupacion}%`} />
          <KpiCard titulo="Reservaciones Totales 2026-2027" valor={String(kpis.total)} />
          <KpiCard
            titulo="Rango de Tarifas 2026-2027"
            valor={
              <>
                {kpis.rango} <span className="text-mn">M.N.</span>
              </>
            }
          />
        </section>

        {/* Calendario */}
        <section
          className="card bg-white rounded-[18px] border border-gray-100 p-6 lg:p-8"
          style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
            <h2 className="text-[18.66px] font-bold text-black">
              {NOMBRES_MESES[mes]} {anio}
            </h2>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="month-navigation-wrapper">
                <button className="month-arrow-btn" onClick={() => navegarMes(-1)}>
                  <ChevronLeft size={14} />
                </button>
                <select
                  className="premium-select"
                  value={mes}
                  onChange={(e) => setMes(parseInt(e.target.value))}
                >
                  {NOMBRES_MESES.map((nombre, idx) => (
                    <option key={nombre} value={idx}>
                      {nombre}
                    </option>
                  ))}
                </select>
                <button className="month-arrow-btn" onClick={() => navegarMes(1)}>
                  <ChevronRight size={14} />
                </button>
              </div>
              <div className="year-selector">
                <button className="year-btn" onClick={() => navegarAnio(-1)}>
                  -
                </button>
                <select
                  className="premium-select"
                  value={anio}
                  onChange={(e) => setAnio(parseInt(e.target.value))}
                >
                  {Array.from({ length: ANIO_MAX - ANIO_MIN + 1 }, (_, i) => ANIO_MIN + i).map(
                    (y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ),
                  )}
                </select>
                <button className="year-btn" onClick={() => navegarAnio(1)}>
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <CalendarGrid
              anio={anio}
              mes={mes}
              estrategia={estrategia}
              hoy={hoy}
              onSelectLibre={abrirModalAgregar}
              onSelectOcupado={abrirModalDetalle}
            />
          </div>
        </section>
      </div>

      <ReservationModal
        state={modal}
        onClose={cerrarModal}
        onConfirm={onConfirmReserva}
        onSave={onSaveReserva}
        onDelete={onDeleteReserva}
        fechasOcupadas={fechasEventosOcupados}
      />
    </div>
  );
}

function KpiCard({ titulo, valor }: { titulo: string; valor: React.ReactNode }) {
  return (
    <div
      className="card bg-white rounded-[18px] border border-gray-100 p-6 flex flex-col"
      style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}
    >
      <span className="text-[1.2rem] text-gray-500 font-bold leading-snug">
        {titulo}
      </span>
      <h3 className="text-2xl font-bold text-[#1E2022] mt-1">{valor}</h3>
    </div>
  );
}
