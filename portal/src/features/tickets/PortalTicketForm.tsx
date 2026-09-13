import { FormEvent } from 'react';
import { CustomerService, TicketCategory } from '../../api';

export type PortalTicketFormValue = {
  idCategoria: string;
  idServicio: string;
  prioridad: string;
  descripcion: string;
};

export function PortalTicketForm({
  services,
  categories,
  form,
  onFormChange,
  onSubmit,
}: {
  services: CustomerService[];
  categories: TicketCategory[];
  form: PortalTicketFormValue;
  onFormChange: (form: PortalTicketFormValue) => void;
  onSubmit: () => void;
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="portal-stack" onSubmit={submit}>
      <label>
        Servicio
        <select value={form.idServicio} onChange={(event) => onFormChange({ ...form, idServicio: event.target.value })}>
          <option value="">Ticket general</option>
          {services.map((service) => (
            <option key={service.idServicio} value={service.idServicio}>
              Servicio {service.idServicio} - {service.tipoServicio}
            </option>
          ))}
        </select>
      </label>

      <label>
        Categoría
        <select value={form.idCategoria} onChange={(event) => onFormChange({ ...form, idCategoria: event.target.value })}>
          <option value="">Seleccionar categoría</option>
          {categories.map((category) => (
            <option key={category.idCategoria} value={category.idCategoria}>
              {category.nombre}
            </option>
          ))}
        </select>
      </label>

      <label>
        Prioridad
        <select value={form.prioridad} onChange={(event) => onFormChange({ ...form, prioridad: event.target.value })}>
          <option value="Alta">Alta</option>
          <option value="Media">Media</option>
          <option value="Baja">Baja</option>
        </select>
      </label>

      <label>
        Descripción
        <textarea value={form.descripcion} onChange={(event) => onFormChange({ ...form, descripcion: event.target.value })} />
      </label>

      <button type="submit" disabled={!form.idCategoria}>
        Crear ticket
      </button>
    </form>
  );
}
