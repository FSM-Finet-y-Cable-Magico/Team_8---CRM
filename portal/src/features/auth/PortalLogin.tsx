import { FormEvent, useState } from 'react';
import { normalizeRutInput } from '../../api';

export function PortalLogin({
  loading,
  status,
  onLogin,
}: {
  loading: boolean;
  status: string;
  onLogin: (credentials: { rut: string; password: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({ rut: '', password: '' });

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onLogin({
      rut: normalizeRutInput(form.rut),
      password: form.password,
    });
  }

  return (
    <main className="portal-login-shell">
      <section className="portal-login-card" aria-label="Acceso Portal Cliente">
        <div className="portal-login-heading">
          <span className="portal-eyebrow">Portal Cliente</span>
          <h1>Portal Cliente FiNet</h1>
          <p>Consulta tus servicios contratados, tickets y credenciales TV IP desde un espacio separado del CRM interno.</p>
        </div>
        <form className="portal-stack" onSubmit={submit}>
          <label>
            RUT
            <input
              value={form.rut}
              onChange={(event) => setForm({ ...form, rut: event.target.value })}
              placeholder="12345678-5"
              autoComplete="username"
            />
          </label>
          <label>
            Contraseña portal
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              autoComplete="current-password"
            />
          </label>
          <button className="portal-primary-button" disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar al portal'}
          </button>
        </form>
        {status && <p className="portal-status">{status}</p>}
      </section>
    </main>
  );
}
