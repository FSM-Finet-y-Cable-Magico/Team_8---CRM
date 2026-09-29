import { FormEvent, useState } from 'react';
import { Eye, EyeOff, Wifi } from 'lucide-react';
import { api, apiErrorMessage, type AuthUser } from '../../api';
import { normalizeAuthUser } from '../../lib';

export function LoginScreen({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
            <div className="login-brand" aria-label="smartCRM">
              <Wifi className="login-brand-icon" size={42} strokeWidth={2.35} aria-hidden="true" />
              <h1><span>smart</span>CRM</h1>
            </div>
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
              Contraseña
              <span className="password-field">
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Ingresa tu contraseña"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showPassword}
                >
                  {showPassword
                    ? <EyeOff size={20} strokeWidth={1.9} aria-hidden="true" />
                    : <Eye size={20} strokeWidth={1.9} aria-hidden="true" />}
                </button>
              </span>
            </label>
            {error && <p className="alert">{error}</p>}
            <button className="login-button" disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
