import { ClipboardCopy, Plus, Sparkles, X } from "lucide-react";
import type {
  NivelPeso,
  NivelEstacional,
  PeriodoEspecial,
} from "../types";
import {
  OPCIONES_PESO,
  OPCIONES_ESTACIONAL,
  NOMBRES_MESES,
  NOMBRES_DIAS_COMPLETOS,
  ORDEN_DIAS,
  DEMANDA_DEFECTO_MESES,
  claseSemaforo,
} from "../semaforo";
import {
  TXT_COL_USUARIO,
  TXT_COL_IA,
  TXT_COL_DIA,
  TXT_COL_MES,
  TXT_COL_NOMBRE_RANGO,
  TXT_POND_DIA_TITULO,
  TXT_POND_MES_TITULO,
  TXT_POND_FECHAS_TITULO,
  TXT_FECHAS_PH_NOMBRE,
  TXT_FECHAS_SEPARADOR,
  TXT_FECHAS_BTN_AGREGAR,
  TXT_FECHAS_BTN_ELIMINAR,
  TXT_BTN_IA_SYNC,
  TXT_BTN_IA_GENERATE,
} from "../textos";

interface PonderationTablesProps {
  diasUser: Record<number, NivelPeso>;
  diasIA: Record<number, NivelPeso>;
  mesesUser: Record<number, NivelEstacional>;
  mesesIA: Record<number, NivelEstacional>;
  periodos: PeriodoEspecial[];
  periodoEliminandoId: number | null;
  onChangeDia: (idDay: number, value: NivelPeso) => void;
  onChangeMes: (idMonth: number, value: NivelEstacional) => void;
  onUpdatePeriodo: (periodo: PeriodoEspecial) => void;
  onAddPeriodo: () => void;
  onDeletePeriodo: (id: number) => void;
  loadingIA: Record<string, boolean>;
  onSyncDiasIA: () => void;
  onSyncMesesIA: () => void;
  onSyncFechasIA: () => void;
  onGenerateDiasIA: () => void;
  onGenerateMesesIA: () => void;
  onGenerateFechasIA: () => void;
}

const cardStyle = { boxShadow: "0 4px 12px rgba(0,0,0,0.03)" };

function IAButtons({
  onGenerate,
  onSync,
  loadingGenerate,
  loadingSync,
}: {
  onGenerate: () => void;
  onSync: () => void;
  loadingGenerate: boolean;
  loadingSync: boolean;
}) {
  const busy = loadingGenerate || loadingSync;
  return (
    <div className="flex gap-1">
      <button
        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-40 transition-colors"
        onClick={onSync}
        disabled={busy}
        title={TXT_BTN_IA_SYNC}
      >
        <ClipboardCopy size={15} />
      </button>
      <button
        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-40 transition-colors"
        onClick={onGenerate}
        disabled={busy}
        title={TXT_BTN_IA_GENERATE}
      >
        <Sparkles size={15} />
      </button>
    </div>
  );
}

/**
 * Tablas secundarias: Ponderación por Día, por Mes y CRUD de Fechas Especiales.
 * Reemplaza renderizarConsolaParametros() y renderizarPeriodosEspeciales(),
 * que construían filas vía innerHTML, por mapeo declarativo.
 */
export default function PonderationTables({
  diasUser,
  diasIA,
  mesesUser,
  mesesIA,
  periodos,
  periodoEliminandoId,
  onChangeDia,
  onChangeMes,
  onUpdatePeriodo,
  onAddPeriodo,
  onDeletePeriodo,
  loadingIA,
  onSyncDiasIA,
  onSyncMesesIA,
  onSyncFechasIA,
  onGenerateDiasIA,
  onGenerateMesesIA,
  onGenerateFechasIA,
}: PonderationTablesProps) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {/* ---------- Ponderación por Día ---------- */}
      <div
        className="card bg-white rounded-[18px] border border-gray-100 p-6 flex flex-col"
        style={cardStyle}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[18.66px] font-bold text-black">{TXT_POND_DIA_TITULO}</h3>
          <IAButtons
            onGenerate={onGenerateDiasIA}
            onSync={onSyncDiasIA}
            loadingGenerate={loadingIA.generate_dias ?? false}
            loadingSync={loadingIA.sync_dias ?? false}
          />
        </div>
        <div className="mt-4 overflow-x-auto bg-[#FAFBFB] border border-gray-100 rounded-xl p-3.5">
          <table className="tabla-demanda table-editable">
            <thead>
              <tr>
                <th>{TXT_COL_DIA}</th>
                <th>{TXT_COL_USUARIO}</th>
                <th>{TXT_COL_IA}</th>
              </tr>
            </thead>
            <tbody>
              {ORDEN_DIAS.map((d) => {
                const valUser = diasUser[d] ?? "Medio";
                const valIA = diasIA[d] ?? "Medio";
                return (
                  <tr key={d}>
                    <td>{NOMBRES_DIAS_COMPLETOS[d]}</td>
                    <td>
                      <select
                        className={`select-mes-cell ${claseSemaforo(valUser)}`}
                        value={valUser}
                        onChange={(e) =>
                          onChangeDia(d, e.target.value as NivelPeso)
                        }
                      >
                        {OPCIONES_PESO.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className={`contenedor-badge-ia ${claseSemaforo(valIA)}`}>
                        {valIA}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- Ponderación por Mes ---------- */}
      <div
        className="card bg-white rounded-[18px] border border-gray-100 p-6 flex flex-col"
        style={cardStyle}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[18.66px] font-bold text-black">{TXT_POND_MES_TITULO}</h3>
          <IAButtons
            onGenerate={onGenerateMesesIA}
            onSync={onSyncMesesIA}
            loadingGenerate={loadingIA.generate_meses ?? false}
            loadingSync={loadingIA.sync_meses ?? false}
          />
        </div>
        <div className="mt-4 overflow-x-auto bg-[#FAFBFB] border border-gray-100 rounded-xl p-3.5">
          <table className="tabla-demanda table-editable">
            <thead>
              <tr>
                <th>{TXT_COL_MES}</th>
                <th>{TXT_COL_USUARIO}</th>
                <th>{TXT_COL_IA}</th>
              </tr>
            </thead>
            <tbody>
              {NOMBRES_MESES.map((m, idx) => {
                const catActual = mesesUser[idx] ?? DEMANDA_DEFECTO_MESES[idx];
                const catIA = mesesIA[idx] ?? catActual;
                return (
                  <tr key={m}>
                    <td>{m}</td>
                    <td>
                      <select
                        className={`select-mes-cell ${claseSemaforo(catActual)}`}
                        value={catActual}
                        onChange={(e) =>
                          onChangeMes(idx + 1, e.target.value as NivelEstacional)
                        }
                      >
                        {OPCIONES_ESTACIONAL.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className={`contenedor-badge-ia ${claseSemaforo(catIA)}`}>
                        {catIA}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- Fechas Especiales (CRUD) ---------- */}
      <div
        className="card bg-white rounded-[18px] border border-gray-100 p-6 flex flex-col md:col-span-2 lg:col-span-1"
        style={cardStyle}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[18.66px] font-bold text-black">
            {TXT_POND_FECHAS_TITULO}
          </h3>
          <IAButtons
            onGenerate={onGenerateFechasIA}
            onSync={onSyncFechasIA}
            loadingGenerate={loadingIA.generate_fechas ?? false}
            loadingSync={loadingIA.sync_fechas ?? false}
          />
        </div>
        <div className="mt-4 overflow-x-auto bg-[#FAFBFB] border border-gray-100 rounded-xl p-3.5">
          <table className="tabla-demanda table-editable tabla-fechas-especiales">
            <thead>
              <tr>
                <th>{TXT_COL_NOMBRE_RANGO}</th>
                <th style={{ textAlign: "center" }}>{TXT_COL_USUARIO}</th>
                <th style={{ textAlign: "center" }}>{TXT_COL_IA}</th>
                <th style={{ textAlign: "center" }} />
              </tr>
            </thead>
            <tbody>
              {periodos.map((p) => (
                <tr key={p.id}>
                  <td>
                    <input
                      type="text"
                      className="input-table-cell"
                      placeholder={TXT_FECHAS_PH_NOMBRE}
                      value={p.nombre}
                      style={{ width: "100%", marginBottom: 4 }}
                      onChange={(e) =>
                        onUpdatePeriodo({ ...p, nombre: e.target.value })
                      }
                    />
                    <div className="rango-fecha-container">
                      <input
                        type="date"
                        className="input-date-custom"
                        value={p.fecha_inicio}
                        onChange={(e) =>
                          onUpdatePeriodo({ ...p, fecha_inicio: e.target.value })
                        }
                      />
                      <span className="separador-fecha">{TXT_FECHAS_SEPARADOR}</span>
                      <input
                        type="date"
                        className="input-date-custom"
                        value={p.fecha_fin}
                        onChange={(e) =>
                          onUpdatePeriodo({ ...p, fecha_fin: e.target.value })
                        }
                      />
                    </div>
                  </td>
                  <td style={{ verticalAlign: "middle" }}>
                    <select
                      className={`select-mes-cell ${claseSemaforo(p.pond_user)}`}
                      value={p.pond_user}
                      onChange={(e) =>
                        onUpdatePeriodo({
                          ...p,
                          pond_user: e.target.value as NivelPeso,
                        })
                      }
                    >
                      {OPCIONES_PESO.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                    <div className={`contenedor-badge-ia ${claseSemaforo(p.pond_ia)}`}>
                      {p.pond_ia}
                    </div>
                  </td>
                  <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                    <button
                      className="btn-eliminar-periodo"
                      disabled={periodoEliminandoId === p.id}
                      onClick={() => onDeletePeriodo(p.id)}
                      aria-label={TXT_FECHAS_BTN_ELIMINAR}
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} style={{ textAlign: "center", padding: 10 }}>
                  <button className="btn-agregar-periodo" onClick={onAddPeriodo}>
                    <Plus
                      size={14}
                      style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }}
                    />
                    {TXT_FECHAS_BTN_AGREGAR}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
