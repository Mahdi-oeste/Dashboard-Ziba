import { useEffect, useRef, useState } from "react";
import { CalendarCheck, Calendar, CalendarPlus, CalendarX2, Check, Save, X } from "lucide-react";
import type {
  ModalState,
  NuevaReservacionPayload,
  EditarReservacionPayload,
} from "../types";
import { NOMBRES_MESES } from "../semaforo";
import {
  TXT_MODAL_TITULO_ADD,
  TXT_MODAL_TITULO_DETAIL,
  TXT_MODAL_ARIA_CERRAR,
  TXT_MODAL_LABEL_CLIENTE_ADD,
  TXT_MODAL_LABEL_PRECIO_FINAL,
  TXT_MODAL_LABEL_PRECIO_SUG_IA,
  TXT_MODAL_LABEL_CONTACTO_ADD,
  TXT_MODAL_LABEL_TEL_ADD,
  TXT_MODAL_LABEL_EMAIL_ADD,
  TXT_MODAL_LABEL_NOTAS,
  TXT_MODAL_LABEL_INICIO_PRE,
  TXT_MODAL_LABEL_PRECIO_PRE,
  TXT_MODAL_LABEL_FIN_POST,
  TXT_MODAL_LABEL_PRECIO_POST,
  TXT_MODAL_LABEL_CLIENTE_DETAIL,
  TXT_MODAL_LABEL_CONTACTO_DETAIL,
  TXT_MODAL_LABEL_TEL_DETAIL,
  TXT_MODAL_LABEL_EMAIL_DETAIL,
  TXT_MODAL_PH_CLIENTE_ADD,
  TXT_MODAL_PH_CONTACTO,
  TXT_MODAL_PH_TEL,
  TXT_MODAL_PH_EMAIL_ADD,
  TXT_MODAL_PH_NOTAS,
  TXT_MODAL_PH_CLIENTE_DETAIL,
  TXT_MODAL_PH_CONTACTO_DETAIL,
  TXT_MODAL_PH_EMAIL_DETAIL,
  TXT_MODAL_ROW_ID,
  TXT_MODAL_ROW_REGISTRADA,
  TXT_MODAL_CARGANDO,
  TXT_MODAL_GUARDANDO,
  TXT_MODAL_BTN_CANCELAR,
  TXT_MODAL_BTN_CERRAR,
  TXT_MODAL_BTN_CONFIRMAR,
  TXT_MODAL_BTN_GUARDAR,
  TXT_MODAL_BTN_CANCELAR_RES,
  TXT_MODAL_ALERT_PRECIO,
  TXT_MODAL_ALERT_PRE_DATE,
  TXT_MODAL_ALERT_POST_DATE,
  TXT_MODAL_ALERT_PRE_DATE_OCUPADA,
  TXT_MODAL_ALERT_POST_DATE_OCUPADA,
  TXT_MODAL_CONFIRM_CANCELAR,
  TXT_MODAL_CLIENTE_DEFECTO,
  TXT_MN,
} from "../textos";
import { getReservacion } from "../api";

interface ReservationModalProps {
  state: ModalState;
  onClose: () => void;
  onConfirm: (payload: NuevaReservacionPayload) => Promise<void>;
  onSave: (id: number, payload: EditarReservacionPayload) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  fechasOcupadas?: Set<string>;
}

/** Formatea "YYYY-MM-DD" -> "12 de Marzo de 2026". */
function formatearFecha(iso: string): string {
  const [anio, mes, dia] = iso.split("-");
  return `${parseInt(dia)} de ${NOMBRES_MESES[parseInt(mes) - 1]} de ${anio}`;
}

interface FormFields {
  cliente: string;
  precio: string;
  contacto: string;
  telefono: string;
  email: string;
  notas: string;
  pre_start_date: string;
  pre_price: string;
  post_end_date: string;
  post_price: string;
}

const EMPTY_FORM: FormFields = {
  cliente: "",
  precio: "",
  contacto: "",
  telefono: "",
  email: "",
  notas: "",
  pre_start_date: "",
  pre_price: "",
  post_end_date: "",
  post_price: "",
};

const labelMxn = (
  <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>({TXT_MN})</span>
);

/**
 * Modal unificado Agregar / Detalle. Reemplaza abrirModalAgregar /
 * abrirModalDetalle / cerrarModalReservacion: la visibilidad y el modo se
 * controlan por estado de React (prop `state`) en vez de .style.display.
 */
export default function ReservationModal({
  state,
  onClose,
  onConfirm,
  onSave,
  onDelete,
  fechasOcupadas,
}: ReservationModalProps) {
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [registro, setRegistro] = useState("—");

  const reservaId = state.reserva?.id_reservation ?? null;

  // Inicializa el formulario al abrir y, en modo detalle, trae el detalle completo.
  useEffect(() => {
    if (state.mode === "add") {
      setForm({ ...EMPTY_FORM, precio: String(state.precioSugerido) });
      setRegistro("—");
      return;
    }
    if (state.mode === "detail" && state.reserva) {
      const r = state.reserva;
      setForm({
        ...EMPTY_FORM,
        cliente: r.nombre_cliente ?? "",
        precio: r.precio_final != null ? String(r.precio_final) : "",
      });
      setRegistro("—");
      setLoadingDetalle(true);
      let cancelado = false;
      getReservacion(r.id_reservation)
        .then((data) => {
          if (cancelado) return;
          setForm({
            cliente: data.nombre_cliente ?? "",
            precio: data.precio_final != null ? String(data.precio_final) : "",
            contacto: data.contacto_nombre ?? "",
            telefono: data.contacto_telefono ?? "",
            email: data.contacto_email ?? "",
            notas: data.notas ?? "",
            pre_start_date: data.pre_start_date ?? "",
            pre_price: data.pre_price != null ? String(data.pre_price) : "",
            post_end_date: data.post_end_date ?? "",
            post_price: data.post_price != null ? String(data.post_price) : "",
          });
          setRegistro(data.fecha_registro ?? "—");
        })
        .catch((err) =>
          console.warn(
            "No se pudo cargar el detalle completo de la reservación:",
            err instanceof Error ? err.message : err,
          ),
        )
        .finally(() => !cancelado && setLoadingDetalle(false));
      return () => {
        cancelado = true;
      };
    }
  }, [state.mode, reservaId, state.fecha, state.precioSugerido, state.reserva]);

  if (state.mode === null) return null;

  const set =
    (campo: keyof FormFields) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function handleConfirm() {
    const precio = parseFloat(form.precio);
    if (!state.fecha || isNaN(precio) || precio <= 0) {
      alert(TXT_MODAL_ALERT_PRECIO);
      return;
    }
    if (form.pre_start_date && form.pre_start_date > state.fecha) {
      alert(TXT_MODAL_ALERT_PRE_DATE);
      return;
    }
    if (form.post_end_date && form.post_end_date < state.fecha) {
      alert(TXT_MODAL_ALERT_POST_DATE);
      return;
    }
    if (form.pre_start_date && fechasOcupadas?.has(form.pre_start_date)) {
      alert(TXT_MODAL_ALERT_PRE_DATE_OCUPADA);
      return;
    }
    if (form.post_end_date && fechasOcupadas?.has(form.post_end_date)) {
      alert(TXT_MODAL_ALERT_POST_DATE_OCUPADA);
      return;
    }
    setGuardando(true);
    try {
      await onConfirm({
        fecha_evento: state.fecha,
        precio_final: precio,
        nombre_cliente: form.cliente.trim() || TXT_MODAL_CLIENTE_DEFECTO,
        client_primary_contact_name: form.contacto.trim() || null,
        client_primary_contact_phone: form.telefono.trim() || null,
        client_primary_contact_email: form.email.trim() || null,
        client_notes: form.notas.trim() || null,
        pre_start_date: form.pre_start_date || null,
        pre_price: form.pre_price ? parseFloat(form.pre_price) : null,
        post_end_date: form.post_end_date || null,
        post_price: form.post_price ? parseFloat(form.post_price) : null,
      });
    } finally {
      setGuardando(false);
    }
  }

  async function handleSave() {
    if (reservaId === null) return;
    if (form.pre_start_date && state.fecha && form.pre_start_date > state.fecha) {
      alert(TXT_MODAL_ALERT_PRE_DATE);
      return;
    }
    if (form.post_end_date && state.fecha && form.post_end_date < state.fecha) {
      alert(TXT_MODAL_ALERT_POST_DATE);
      return;
    }
    if (form.pre_start_date && fechasOcupadas?.has(form.pre_start_date) && form.pre_start_date !== state.fecha) {
      alert(TXT_MODAL_ALERT_PRE_DATE_OCUPADA);
      return;
    }
    if (form.post_end_date && fechasOcupadas?.has(form.post_end_date) && form.post_end_date !== state.fecha) {
      alert(TXT_MODAL_ALERT_POST_DATE_OCUPADA);
      return;
    }
    setGuardando(true);
    try {
      await onSave(reservaId, {
        nombre_cliente: form.cliente.trim(),
        precio_final: parseFloat(form.precio) || null,
        contacto_nombre: form.contacto.trim() || null,
        contacto_telefono: form.telefono.trim() || null,
        contacto_email: form.email.trim() || null,
        notas: form.notas.trim() || null,
        pre_start_date: form.pre_start_date || null,
        pre_price: form.pre_price ? parseFloat(form.pre_price) : null,
        post_end_date: form.post_end_date || null,
        post_price: form.post_price ? parseFloat(form.post_price) : null,
      });
    } finally {
      setGuardando(false);
    }
  }

  async function handleDelete() {
    if (reservaId === null) return;
    if (!confirm(TXT_MODAL_CONFIRM_CANCELAR(reservaId))) return;
    setEliminando(true);
    try {
      await onDelete(reservaId);
    } finally {
      setEliminando(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <button className="modal-close-btn" onClick={onClose} aria-label={TXT_MODAL_ARIA_CERRAR}>
          <X size={18} />
        </button>

        {state.mode === "add" ? (
          <>
            <h3 className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CalendarPlus size={18} /> {TXT_MODAL_TITULO_ADD}
            </h3>
            <p className="modal-fecha">
              {state.fecha ? formatearFecha(state.fecha) : ""}
            </p>

            <Campo label={TXT_MODAL_LABEL_CLIENTE_ADD}>
              <input
                type="text"
                className="input-table-cell"
                placeholder={TXT_MODAL_PH_CLIENTE_ADD}
                style={{ width: "100%" }}
                value={form.cliente}
                onChange={set("cliente")}
                autoFocus
              />
            </Campo>
            <Campo label={<>{TXT_MODAL_LABEL_PRECIO_FINAL} {labelMxn}</>}>
              <input
                type="number"
                className="input-table-cell"
                min={0}
                step={1000}
                style={{ width: "100%" }}
                value={form.precio}
                onChange={set("precio")}
              />
            </Campo>
            <Campo label={TXT_MODAL_LABEL_PRECIO_SUG_IA}>
              <p style={{ fontWeight: 700, color: "var(--ai-blue)", margin: "4px 0 0" }}>
                ${Number(state.precioIA).toLocaleString("es-MX")} {TXT_MN}
              </p>
            </Campo>
            <Campo label={TXT_MODAL_LABEL_CONTACTO_ADD}>
              <input
                type="text"
                className="input-table-cell"
                placeholder={TXT_MODAL_PH_CONTACTO}
                style={{ width: "100%" }}
                value={form.contacto}
                onChange={set("contacto")}
              />
            </Campo>
            <Campo label={TXT_MODAL_LABEL_TEL_ADD}>
              <input
                type="tel"
                className="input-table-cell"
                placeholder={TXT_MODAL_PH_TEL}
                style={{ width: "100%" }}
                value={form.telefono}
                onChange={set("telefono")}
              />
            </Campo>
            <Campo label={TXT_MODAL_LABEL_EMAIL_ADD}>
              <input
                type="email"
                className="input-table-cell"
                placeholder={TXT_MODAL_PH_EMAIL_ADD}
                style={{ width: "100%" }}
                value={form.email}
                onChange={set("email")}
              />
            </Campo>
            <Campo label={TXT_MODAL_LABEL_NOTAS}>
              <input
                type="text"
                className="input-table-cell"
                placeholder={TXT_MODAL_PH_NOTAS}
                style={{ width: "100%" }}
                value={form.notas}
                onChange={set("notas")}
              />
            </Campo>
            <div className="modal-row-2">
              <Campo label={TXT_MODAL_LABEL_INICIO_PRE}>
                <DateField value={form.pre_start_date} onChange={set("pre_start_date")} />
              </Campo>
              <Campo label={<>{TXT_MODAL_LABEL_PRECIO_PRE} {labelMxn}</>}>
                <input
                  type="number"
                  className="input-table-cell"
                  min={0}
                  step={1000}
                  style={{ width: "100%" }}
                  value={form.pre_price}
                  onChange={set("pre_price")}
                />
              </Campo>
            </div>
            <div className="modal-row-2">
              <Campo label={TXT_MODAL_LABEL_FIN_POST}>
                <DateField value={form.post_end_date} onChange={set("post_end_date")} />
              </Campo>
              <Campo label={<>{TXT_MODAL_LABEL_PRECIO_POST} {labelMxn}</>}>
                <input
                  type="number"
                  className="input-table-cell"
                  min={0}
                  step={1000}
                  style={{ width: "100%" }}
                  value={form.post_price}
                  onChange={set("post_price")}
                />
              </Campo>
            </div>

            <div className="modal-actions">
              <button className="btn-modal-cancelar" onClick={onClose}>
                {TXT_MODAL_BTN_CANCELAR}
              </button>
              <button
                className="btn-modal-confirmar"
                onClick={handleConfirm}
                disabled={guardando}
              >
                {guardando ? TXT_MODAL_GUARDANDO : <><Check size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} /> {TXT_MODAL_BTN_CONFIRMAR}</>}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CalendarCheck size={18} /> {TXT_MODAL_TITULO_DETAIL}
            </h3>
            <p className="modal-fecha">
              {state.fecha ? formatearFecha(state.fecha) : ""}
            </p>

            <div className="modal-detail-row">
              <span>{TXT_MODAL_ROW_ID}</span>
              <strong style={{ color: "var(--text-muted)" }}>
                #{reservaId}
              </strong>
            </div>

            <Campo label={TXT_MODAL_LABEL_CLIENTE_DETAIL}>
              <input
                type="text"
                className="input-table-cell"
                placeholder={TXT_MODAL_PH_CLIENTE_DETAIL}
                style={{ width: "100%" }}
                value={form.cliente}
                onChange={set("cliente")}
              />
            </Campo>
            <Campo label={<>{TXT_MODAL_LABEL_PRECIO_FINAL} {labelMxn}</>}>
              <input
                type="number"
                className="input-table-cell"
                min={0}
                step={1000}
                style={{ width: "100%" }}
                value={form.precio}
                onChange={set("precio")}
              />
            </Campo>
            <Campo label={TXT_MODAL_LABEL_CONTACTO_DETAIL}>
              <input
                type="text"
                className="input-table-cell"
                placeholder={TXT_MODAL_PH_CONTACTO_DETAIL}
                style={{ width: "100%" }}
                value={form.contacto}
                onChange={set("contacto")}
              />
            </Campo>
            <Campo label={TXT_MODAL_LABEL_TEL_DETAIL}>
              <input
                type="tel"
                className="input-table-cell"
                placeholder={TXT_MODAL_PH_TEL}
                style={{ width: "100%" }}
                value={form.telefono}
                onChange={set("telefono")}
              />
            </Campo>
            <Campo label={TXT_MODAL_LABEL_EMAIL_DETAIL}>
              <input
                type="email"
                className="input-table-cell"
                placeholder={TXT_MODAL_PH_EMAIL_DETAIL}
                style={{ width: "100%" }}
                value={form.email}
                onChange={set("email")}
              />
            </Campo>
            <Campo label={TXT_MODAL_LABEL_NOTAS}>
              <input
                type="text"
                className="input-table-cell"
                placeholder={TXT_MODAL_PH_NOTAS}
                style={{ width: "100%" }}
                value={form.notas}
                onChange={set("notas")}
              />
            </Campo>
            <div className="modal-row-2">
              <Campo label={TXT_MODAL_LABEL_INICIO_PRE}>
                <DateField value={form.pre_start_date} onChange={set("pre_start_date")} />
              </Campo>
              <Campo label={<>{TXT_MODAL_LABEL_PRECIO_PRE} {labelMxn}</>}>
                <input
                  type="number"
                  className="input-table-cell"
                  min={0}
                  step={1000}
                  style={{ width: "100%" }}
                  value={form.pre_price}
                  onChange={set("pre_price")}
                />
              </Campo>
            </div>
            <div className="modal-row-2">
              <Campo label={TXT_MODAL_LABEL_FIN_POST}>
                <DateField value={form.post_end_date} onChange={set("post_end_date")} />
              </Campo>
              <Campo label={<>{TXT_MODAL_LABEL_PRECIO_POST} {labelMxn}</>}>
                <input
                  type="number"
                  className="input-table-cell"
                  min={0}
                  step={1000}
                  style={{ width: "100%" }}
                  value={form.post_price}
                  onChange={set("post_price")}
                />
              </Campo>
            </div>

            <div className="modal-detail-row">
              <span>{TXT_MODAL_ROW_REGISTRADA}</span>
              <strong style={{ color: "var(--text-muted)" }}>{registro}</strong>
            </div>

            {loadingDetalle && (
              <div
                style={{
                  textAlign: "center",
                  padding: "12px 0",
                  color: "var(--text-muted)",
                  fontSize: "0.85rem",
                }}
              >
                {TXT_MODAL_CARGANDO}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-modal-cancelar" onClick={onClose}>
                {TXT_MODAL_BTN_CERRAR}
              </button>
              <button
                className="btn-modal-confirmar"
                onClick={handleSave}
                disabled={guardando || loadingDetalle}
              >
                {guardando ? TXT_MODAL_GUARDANDO : <><Save size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} /> {TXT_MODAL_BTN_GUARDAR}</>}
              </button>
              <button
                className="btn-modal-eliminar"
                onClick={handleDelete}
                disabled={eliminando}
              >
                <CalendarX2 size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} /> {TXT_MODAL_BTN_CANCELAR_RES}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Campo({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function DateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="date-field-wrapper">
      <input
        ref={ref}
        type="date"
        className={`input-table-cell${value ? "" : " date-empty"}`}
        style={{ width: "100%" }}
        value={value}
        onChange={onChange}
      />
      <button
        type="button"
        className="date-picker-trigger"
        tabIndex={-1}
        onClick={() => ref.current?.showPicker()}
      >
        <Calendar size={13} />
      </button>
    </div>
  );
}
