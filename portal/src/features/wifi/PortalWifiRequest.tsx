import { FormEvent } from 'react';
import { CustomerService } from '../../api';

export type WifiRequestForm = {
  idServicio: string;
  nuevaContrasena: string;
  observaciones: string;
};

export function PortalWifiRequest({
  services,
  form,
  onFormChange,
  onSubmit,
}: {
  services: CustomerService[];
  form: WifiRequestForm;
  onFormChange: (form: WifiRequestForm) => void;
  onSubmit: () => void;
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="portal-panel portal-stack" onSubmit={submit}>
      <div>
        <span className="portal-eyebrow">Wi-Fi</span>
        <h2>Solicitud cambio Wi-Fi</h2>
        <p className="portal-muted">El portal registra la solicitud para revisión técnica; no cambia el router automáticamente.</p>
      </div>

      <label>
        Servicio
        <select value={form.idServicio} onChange={(event) => onFormChange({ ...form, idServicio: event.target.value })}>
          <option value="">Seleccionar servicio</option>
          {services.map((service) => (
            <option key={service.idServicio} value={service.idServicio}>
              Servicio {service.idServicio} - {service.tipoServicio}
            </option>
          ))}
        </select>
      </label>

      <label>
        Nueva clave sugerida
        <input
          type="password"
          value={form.nuevaContrasena}
          onChange={(event) => onFormChange({ ...form, nuevaContrasena: event.target.value })}
          placeholder="Opcional, mínimo 8 caracteres"
          autoComplete="new-password"
        />
      </label>

      <label>
        Observaciones
        <textarea
          value={form.observaciones}
          onChange={(event) => onFormChange({ ...form, observaciones: event.target.value })}
          placeholder="Ej: cambiar nombre de red, horario de contacto o detalle técnico."
        />
      </label>

      <button type="submit" disabled={!form.idServicio}>
        Registrar solicitud
      </button>
    </form>
  );
}
