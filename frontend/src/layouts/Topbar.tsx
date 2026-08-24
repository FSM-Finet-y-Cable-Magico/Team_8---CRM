import { Building2, ChevronDown, LogOut, Settings } from 'lucide-react';
import type { AuthUser, Company } from '../api';

export function Topbar({
  isAdmin,
  scope,
  companies,
  currentCompanyName,
  user,
  userInitials,
  onScopeChange,
  onOpenSettings,
  onLogout,
}: {
  isAdmin: boolean;
  scope: string;
  companies: Company[];
  currentCompanyName: string;
  user: AuthUser;
  userInitials: string;
  onScopeChange: (scope: string) => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-context">
        {isAdmin && (
          <div className="company-scope-control">
            <Building2 size={18} strokeWidth={1.8} aria-hidden="true" />
            <select aria-label="Seleccionar empresa" value={scope} onChange={(event) => onScopeChange(event.target.value)}>
              <option value="consolidado">Consolidado</option>
              {companies.map((company) => (
                <option key={company.idEmpresa} value={company.idEmpresa}>
                  {company.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="active-company" aria-label={`Empresa activa: ${currentCompanyName}`}>
          <strong>{currentCompanyName}</strong>
          <span className="company-status-dot" aria-hidden="true" />
        </div>
        <details className="profile-menu">
          <summary className="profile-trigger" aria-label="Abrir menú de perfil">
            <span className="profile-avatar" aria-hidden="true">{userInitials || 'U'}</span>
            <ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" />
          </summary>
          <div className="profile-dropdown">
            <header className="profile-summary">
              <span className="profile-avatar profile-avatar-large" aria-hidden="true">{userInitials || 'U'}</span>
              <span>
                <strong>{user.nombreCompleto}</strong>
                <small>{user.email ?? 'Sin correo registrado'}</small>
              </span>
            </header>
            <button
              type="button"
              className="profile-menu-item"
              onClick={(event) => {
                event.currentTarget.closest('details')?.removeAttribute('open');
                onOpenSettings();
              }}
            >
              <Settings size={18} strokeWidth={1.8} aria-hidden="true" />
              Configuración
            </button>
            <button type="button" className="profile-menu-item danger" onClick={onLogout}>
              <LogOut size={18} strokeWidth={1.8} aria-hidden="true" />
              Cerrar sesión
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
