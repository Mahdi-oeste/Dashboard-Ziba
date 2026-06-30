import { ClipboardCopy, Sparkles } from "lucide-react";
import type { PesosUsuario, PesoKey, NivelPeso } from "../types";
import { OPCIONES_PESO, claseSemaforo } from "../semaforo";
import {
  TXT_IMPORTANCIA_TITULO,
  TXT_IMPORTANCIA_COL_POND,
  TXT_COL_USUARIO,
  TXT_COL_IA,
  TXT_BTN_IA_SYNC,
  TXT_BTN_IA_GENERATE,
  FILAS_IMPORTANCIA,
} from "../textos";

interface ImportanceTableProps {
  pesos: PesosUsuario;
  /** Badges IA por clave (provienen de GET /pesos-usuario). */
  iaBadges: Partial<Record<PesoKey, NivelPeso>>;
  onChange: (key: PesoKey, value: NivelPeso) => void;
  loadingIA: Record<string, boolean>;
  onSyncIA: () => void;
  onGenerateIA: () => void;
}

/**
 * Tabla "Importancia" (Pesos del Usuario). Migra #tbodyPesosUsuario.
 * La clase de semáforo del select se deriva declarativamente del valor actual
 * en vez de reasignar className por imperativo.
 */
export default function ImportanceTable({
  pesos,
  iaBadges,
  onChange,
  loadingIA,
  onSyncIA,
  onGenerateIA,
}: ImportanceTableProps) {
  return (
    <div
      className="card pesos-usuario-box bg-white rounded-[18px] border border-gray-100 p-6 flex flex-col lg:flex-[1.3]"
      style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}
    >
      <div className="flex justify-between items-center">
        <h3 className="text-[18.66px] font-bold text-black">{TXT_IMPORTANCIA_TITULO}</h3>
        <div className="flex gap-1">
          <button
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-40 transition-colors"
            onClick={onSyncIA}
            disabled={loadingIA.sync_importancia || loadingIA.generate_importancia}
            title={TXT_BTN_IA_SYNC}
          >
            <ClipboardCopy size={15} />
          </button>
          <button
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-40 transition-colors"
            onClick={onGenerateIA}
            disabled={loadingIA.sync_importancia || loadingIA.generate_importancia}
            title={TXT_BTN_IA_GENERATE}
          >
            <Sparkles size={15} />
          </button>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto bg-[#FAFBFB] border border-gray-100 rounded-xl p-3.5">
        <table className="tabla-demanda table-editable">
          <thead>
            <tr>
              <th>{TXT_IMPORTANCIA_COL_POND}</th>
              <th>{TXT_COL_USUARIO}</th>
              <th className="th-ia">{TXT_COL_IA}</th>
            </tr>
          </thead>
          <tbody>
            {FILAS_IMPORTANCIA.map(({ key, label }) => {
              const valUser = pesos[key];
              const valIA = iaBadges[key] ?? "Medio";
              return (
                <tr key={key}>
                  <td>{label}</td>
                  <td>
                    <select
                      className={`select-peso-usuario select-mes-cell ${claseSemaforo(valUser)}`}
                      value={valUser}
                      onChange={(e) =>
                        onChange(key, e.target.value as NivelPeso)
                      }
                    >
                      {OPCIONES_PESO.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="td-ia">
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
  );
}
