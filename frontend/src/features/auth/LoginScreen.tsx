import { FormEvent, useState } from 'react';
import { api, apiErrorMessage, type AuthUser } from '../../api';
import { normalizeAuthUser } from '../../lib';

export function LoginScreen({ onLogin, onOpenPortal }: { onLogin: (user: AuthUser) => void; onOpenPortal: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data } = await api.post('/auth/login', { email, password });
      const normalizedUser = normalizeAuthUser(data.user);
      localStorage.setItem('finet_token', data.accessToken);
      localStorage.setItem('finet_user', JSON.stringify(normalizedUser));
      onLogin(normalizedUser);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card" aria-label="Acceso al sistema CRM">
        <section className="login-panel">
          <div className="login-heading">
            <h1>Sistema de GestiÃ³n CRM</h1>
            <p>FiNet y Cable MÃ¡gico Litoral Â· AdministraciÃ³n comercial, clientes y soporte.</p>
          </div>
          <form onSubmit={submit} className="stack" autoComplete="off">
            <label>
              Correo
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="off"
                placeholder="correo@finet.local"
              />
            </label>
            <label>
              ContraseÃ±a
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="off"
                placeholder="Ingresa tu contraseÃ±a"
              />
            </label>
            {error && <p className="alert">{error}</p>}
            <button className="login-button" disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
          <button type="button" className="secondary portal-entry-button" onClick={onOpenPortal}>
            Ingresar al portal cliente
          </button>
        </section>
      </section>
    </main>
  );
}
